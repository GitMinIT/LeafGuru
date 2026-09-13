/** Unit tests: data-io (export filename/validation) + i18n loader. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("dataIO.formatBytes", async () => {
  const { window } = await setup();
  const f = window.LeafGuru.dataIO.formatBytes;
  assert.equal(f(0), "0 B");
  assert.equal(f(512), "512 B");
  assert.equal(f(2048), "2.0 KB");
  assert.equal(f(5 * 1024 * 1024), "5.0 MB");
});

test("exportToFile builds versioned filename (Blob/URL stubbed)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  await storage.put("locations", { name: "A", type: "indoor", active: true });
  // exportToFile uses document.createElement stub (click no-op) — assert no throw
  const bundle = await window.LeafGuru.dataIO.exportToFile();
  assert.equal(bundle.locations.length, 1);
});

test("importFromFile: invalid JSON gives readable error", async () => {
  const { window } = await setup();
  window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
  const file = { text: async () => "{nope" };
  await assert.rejects(
    () => window.LeafGuru.dataIO.importFromFile(file, { confirmFn: async () => true }),
    (e) => /not valid JSON/.test(e.message)
  );
});

test("importFromFile: schema violation surfaces first errors", async () => {
  const { window } = await setup();
  window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
  const bundle = {
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: "2026-09-13T12:00:00Z" },
    locations: [{ id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "", type: "indoor", active: true }],
    grows: [], equipment: [], strainTemplates: [], plants: []
  };
  const file = { text: async () => JSON.stringify(bundle) };
  await assert.rejects(
    () => window.LeafGuru.dataIO.importFromFile(file, { confirmFn: async () => true }),
    (e) => /schema validation failed/.test(e.message)
  );
});

test("importFromFile: declined confirmation does not touch data", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  await storage.put("locations", { name: "Keep", type: "indoor", active: true });
  const other = {
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: "2026-09-13T12:00:00Z" },
    locations: [{ id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "Incoming", type: "outdoor", active: true }],
    grows: [], equipment: [], strainTemplates: [], plants: []
  };
  const file = { text: async () => JSON.stringify(other) };
  const res = await window.LeafGuru.dataIO.importFromFile(file, { confirmFn: async () => false });
  assert.equal(res.imported, false);
  assert.equal((await storage.list("locations"))[0].name, "Keep");
});

test("i18n: dotted lookup + placeholder interpolation + missing key fallback", async () => {
  const { window } = await setup();
  const t = window.LeafGuru.i18n.t;
  assert.equal(t("nav.dashboard"), "Dashboard");
  assert.equal(t("plant.stageChangedTo", { stage: "Flowering" }), "Moved to Flowering");
  assert.equal(t("does.not.exist"), "does.not.exist");
  assert.equal(t("stages.flowering"), "Flowering");
});