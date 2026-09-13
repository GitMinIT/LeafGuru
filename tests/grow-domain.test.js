/** Unit tests: grow entity — validation, links, bundle round-trip. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("grows store accepts valid record and enforces status enum", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const grow = await storage.put("grows", {
    name: "Summer 2026", status: "active", startDate: "2026-06-01", endDate: null, notes: ""
  });
  assert.ok(grow.id);
  assert.equal(grow.status, "active");
  await assert.rejects(
    () => storage.put("grows", { name: "bad", status: "nonsense" }),
    window.LeafGuru.LeafGuruValidationError
  );
});

test("locations/plants/equipment/tasks accept optional growId", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const grow = await storage.put("grows", { name: "G", status: "planned" });
  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true, growId: grow.id });
  const plant = await storage.put("plants", {
    name: "P", strainTemplateId: null, customStrain: null, sex: "unknown",
    germinationDate: "2026-09-01", stage: "planned", locationId: loc.id,
    status: "growing", growId: grow.id
  });
  const equip = await storage.put("equipment", {
    name: "LED", category: "light", status: "in-use", growId: grow.id, availableEverywhere: true
  });
  const task = await storage.put("tasks", {
    title: "T", status: "open", priority: "medium", growId: grow.id, description: ""
  });
  const [locs, plants, equips, tasks] = await Promise.all([
    storage.list("locations"), storage.list("plants"),
    storage.list("equipment"), storage.list("tasks")
  ]);
  assert.equal(locs[0].growId, grow.id);
  assert.equal(plants[0].growId, grow.id);
  assert.equal(equips[0].availableEverywhere, true);
  assert.equal(tasks[0].growId, grow.id);
});

test("equipment locationAssignments allow open assignment (to: null)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const loc = await storage.put("locations", { name: "L", type: "indoor", active: true });
  const eq = await storage.put("equipment", {
    name: "LED", category: "light", status: "in-use",
    locationAssignments: [{ locationId: loc.id, from: new Date().toISOString(), to: null }]
  });
  assert.equal(eq.locationAssignments.length, 1);
  assert.equal(eq.locationAssignments[0].to, null);
});

test("bundle includes grows and survives export/import round-trip", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  const grow = await storage.put("grows", { name: "Roundtrip", status: "closed", notes: "" });
  const bundle = await storage.exportBundle();
  const check = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
  assert.equal(check.valid, true, JSON.stringify(check.errors.slice(0, 3)));
  assert.equal(bundle.grows.length, 1);
  await storage.importBundle(bundle);
  const after = await storage.list("grows");
  assert.equal(after.length, 1);
  assert.equal(after[0].name, "Roundtrip");
  assert.equal(after[0].status, "closed");
});

test("bundle without grows key is rejected", async () => {
  const { window } = await setup();
  const v = window.LeafGuru.validator;
  const bundle = {
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: new Date().toISOString() },
    locations: [], equipment: [], strainTemplates: [], plants: []
  };
  const check = v.validateBundle(bundle, window.LeafGuru.schemas);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.path === "$.grows"));
});