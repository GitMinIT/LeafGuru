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
  await storage.put("locations", { name: "Box", type: "indoor", active: true });
  await storage.put("plants", { name: "P", stage: "seedling", status: "growing" });
  await storage.put("logEntries", {
    growId: UUID, at: new Date().toISOString(), categories: ["note"], text: "x"
  });
  await storage.wipe();
  for (const entity of ["locations", "plants", "logEntries"]) {
    assert.equal((await storage.list(entity)).length, 0);
  }
});

test("change tracking: every put records an edit with a diff", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  // create → "created" entry
  const plant = await storage.put("plants", {
    name: "Alpha", stage: "seedling", status: "growing", sex: "unknown"
  });
  // update sex when the stage reveals it
  const fresh = await storage.get("plants", plant.id);
  fresh.sex = "female";
  fresh.stage = "flowering";
  await storage.put("plants", fresh);

  const edits = await storage.editsOf("plants", plant.id);
  assert.equal(edits.length, 2);
  assert.ok(edits[0].at, "edits are timestamped");
  assert.equal(edits[0].changes.length, 1);
  assert.equal(edits[0].changes[0].key, "created");
  const change = edits[1].changes.find((c) => c.key === "sex");
  assert.equal(change.from, "unknown");
  assert.equal(change.to, "female");
  assert.ok(edits[1].changes.some((c) => c.key === "stage"), "stage change tracked");
  // volatile fields are not tracked
  assert.ok(!edits[1].changes.some((c) => c.key === "updatedAt"), "updatedAt skipped");

  // editsOf filters by entity + id
  const other = await storage.put("grows", { name: "G", status: "active" });
  await storage.put("grows", { ...other, status: "closed" });
  assert.equal((await storage.editsOf("grows", other.id)).length, 2);
  assert.equal((await storage.editsOf("plants", other.id)).length, 0);
});

test("change tracking: no-op puts do not create entries", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const grow = await storage.put("grows", { name: "G", status: "active" });
  const same = await storage.get("grows", grow.id);
  const countBefore = (await storage.list("entityEdits")).length;
  await storage.put("grows", { ...same });
  const edits = await storage.editsOf("grows", grow.id);
  assert.ok(edits.every((e) => e.changes.length >= 1 || e.changes[0]?.key === "created"),
    "no empty change lists");
  const after = await storage.list("entityEdits");
  assert.equal(after.length, countBefore, "no-op put adds nothing");
});

test("REGRESSION: version bump upgrades a stale DB (creates missing stores)", async () => {
  // Regression for the "Delete all data does nothing" bug: logEntries was
  // added without a DB_VERSION bump, so real browsers never ran
  // onupgradeneeded → the store was missing → every transaction (incl.
  // wipe) threw NotFoundError. DB_VERSION must be 3 and the upgrade
  // handler must create missing stores + drop unknown ones.
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const w = setupResult.window;

  const created = [];
  const deleted = [];
  const dbFacade = {
    objectStoreNames: {
      contains: (n) => n === "locations", // stale DB: locations only
      [Symbol.iterator]: function* () { yield "locations"; },
    },
    createObjectStore: (name) => { created.push(name); return { name }; },
    deleteObjectStore: (name) => deleted.push(name),
  };

  // capture the adapter's upgrade handler: run it against the stale facade
  let upgradeHandler = null;
  const req = {
    set onupgradeneeded(fn) { upgradeHandler = fn; },
    set onsuccess(fn) { fn({ target: req }); },
    set onerror(fn) {},
    result: { /* unused facade */ },
  };
  setupResult.window.indexedDB.open = () => req;
  const adapter = new w.LeafGuru.LocalAdapter();
  await adapter._open();
  assert.ok(upgradeHandler, "upgrade handler registered");
  upgradeHandler({ target: { result: dbFacade } });

  for (const entity of w.LeafGuru.ENTITIES) {
    if (entity === "locations") continue;
    assert.ok(created.includes(entity), `upgrade creates missing store: ${entity}`);
  }
  assert.deepEqual(deleted, [], "known stores are not dropped");
  assert.notEqual(deleted.includes("locations"), true);

  // DB_VERSION must exceed the last store-adding change:
  //   3: journal (logEntries), 4: change log (entityEdits), 5: sensor readings
  // Assert the number, not a literal: a hardcoded "= 4" would fire on
  // every correctly-done bump, which trains people to ignore it.
  const source = require("node:fs")
    .readFileSync("static/js/adapter/local-adapter.js", "utf8");
  const version = Number(/DB_VERSION = (\d+)/.exec(source)?.[1]);
  assert.ok(Number.isFinite(version), "DB_VERSION is a number");
  assert.ok(version >= 5, `DB_VERSION must be at least 5 (sensor readings), got ${version}`);
  // and every entity really is in the store list
  for (const entity of w.LeafGuru.ENTITIES) {
    assert.match(source, new RegExp(`"${entity}"`), `store list contains ${entity}`);
  }
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
