/** Unit tests: LocalAdapter behavior over the IDB stub. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const UUID = "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d";

test("put generates id + timestamps and validates", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const rec = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  assert.ok(/^[0-9a-f-]{36}$/.test(rec.id));
  assert.ok(rec.createdAt);
  assert.ok(rec.updatedAt);
});

test("put rejects schema-invalid records (LeafGuruValidationError)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  await assert.rejects(
    () => storage.put("plants", { name: "p", stage: "dancing", status: "growing" }),
    (e) => e.name === "LeafGuruValidationError" && e.errors.some((x) => x.path === "$.stage")
  );
});

test("get returns null for unknown id", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  assert.equal(await storage.get("locations", UUID), null);
});

test("update keeps id, refreshes updatedAt", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const created = await storage.put("locations", { name: "A", type: "indoor", active: true });
  await new Promise((r) => setTimeout(r, 5));
  const updated = await storage.put("locations", { ...created, name: "B" });
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, "B");
  assert.ok(updated.updatedAt >= created.updatedAt);
});

test("delete removes record", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const rec = await storage.put("locations", { name: "A", type: "outdoor", active: true });
  await storage.delete("locations", rec.id);
  assert.equal(await storage.get("locations", rec.id), null);
});

test("exportBundle: meta + all nine entity arrays", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  await storage.put("locations", { name: "A", type: "indoor", active: true });
  const bundle = await storage.exportBundle();
  assert.equal(bundle.meta.app, "LeafGuru");
  assert.equal(bundle.meta.schemaVersion, 1);
  for (const key of ["locations", "equipment", "strainTemplates", "plants", "stageLogs", "measurements", "locationChanges", "tasks", "photos"]) {
    assert.ok(Array.isArray(bundle[key]), key);
  }
  assert.equal(bundle.locations.length, 1);
});

test("importBundle round-trip preserves data", async () => {
  const { window } = await setup();
  const a = new window.LeafGuru.LocalAdapter();
  const loc = await a.put("locations", { name: "Box", type: "indoor", active: true });
  await a.put("plants", { name: "P1", stage: "seedling", status: "growing", locationId: loc.id });
  const bundle = await a.exportBundle();

  const b = new window.LeafGuru.LocalAdapter();
  await b.importBundle(JSON.parse(JSON.stringify(bundle)));
  const plants = await b.list("plants");
  assert.equal(plants.length, 1);
  assert.equal(plants[0].locationId, loc.id);
  const locations = await b.list("locations");
  assert.equal(locations[0].name, "Box");
});

test("importBundle replaces previous data (not merges)", async () => {
  // NOTE: within one test the IDB stub is shared (one browser), so we import
  // a hand-built bundle instead of exporting from a second adapter.
  const { window } = await setup();
  const a = new window.LeafGuru.LocalAdapter();
  await a.put("locations", { name: "Old", type: "indoor", active: true });

  const UUID = "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d";
  const bundle = {
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: new Date().toISOString() },
    locations: [{ id: UUID, name: "New", type: "outdoor", active: true }],
    grows: [], equipment: [], strainTemplates: [], plants: []
  };
  await a.importBundle(bundle);
  const locs = await a.list("locations");
  assert.equal(locs.length, 1);
  assert.equal(locs[0].name, "New");
});

test("importBundle rejects corrupt records atomically (no partial write)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  await storage.put("locations", { name: "Keep", type: "indoor", active: true });
  const bundle = await storage.exportBundle();
  bundle.plants.push({ id: UUID, name: "bad", stage: "dancing", status: "growing" });

  await assert.rejects(() => storage.importBundle(bundle), (e) => e.name === "LeafGuruValidationError");
  const locs = await storage.list("locations");
  assert.equal(locs.length, 1, "existing data must survive failed import");
  assert.equal((await storage.list("plants")).length, 0);
});

test("wipe empties all stores", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  await storage.put("locations", { name: "A", type: "indoor", active: true });
  await storage.put("tasks", { title: "T", status: "open" });
  await storage.wipe();
  assert.equal((await storage.list("locations")).length, 0);
  assert.equal((await storage.list("tasks")).length, 0);
});

test("usage returns bytes estimate shape", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const u = await storage.usage();
  assert.ok(typeof u.bytes === "number");
});
test("exportBundle carries appVersion provenance", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const bundle = await storage.exportBundle();
  assert.equal(bundle.meta.app, "LeafGuru");
  assert.equal(bundle.meta.appVersion, window.LeafGuru.VERSION);
  assert.equal(window.LeafGuru.VERSION, "0.1.0");
});

test("importBundle accepts bundles with appVersion", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const bundle = {
    meta: { app: "LeafGuru", appVersion: "0.9.9", schemaVersion: 1, exportedAt: "2026-09-13T12:00:00Z" },
    grows: [], locations: [], grows: [], equipment: [], strainTemplates: [], plants: []
  };
  await storage.importBundle(bundle); // must not throw
});
