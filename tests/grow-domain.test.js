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

test("plants/equipment/tasks accept optional growId; locations link via grow.locationIds", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const grow = await storage.put("grows", { name: "G", status: "planned" });
  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
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
  // grow lists its locations
  const grow2 = await storage.put("grows", { ...grow, locationIds: [loc.id] });
  const [locs, plants, equips, tasks, grows] = await Promise.all([
    storage.list("locations"), storage.list("plants"),
    storage.list("equipment"), storage.list("tasks"), storage.list("grows")
  ]);
  assert.equal(locs[0].growId, undefined, "locations no longer carry growId");
  assert.equal(plants[0].growId, grow.id);
  assert.equal(equips[0].availableEverywhere, true);
  assert.equal(tasks[0].growId, grow.id);
  assert.deepEqual(grows[0].locationIds, [loc.id]);
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

test("costSummary sums per currency, skips shared and costless items", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const equipment = [
    { growId: "G1", cost: 120, currency: "EUR" },
    { growId: "G1", cost: 79.9, currency: "EUR" },
    { growId: "G1", cost: 40, currency: "USD" },
    { growId: "G1", cost: null, currency: "EUR" },        // costless → skipped
    { growId: "G2", cost: 500, currency: "EUR" },         // other grow
    { cost: 15, currency: "EUR", availableEverywhere: true } // shared → skipped
  ];
  const summary = gd.costSummary(equipment, "G1");
  assert.equal(summary.length, 2);
  assert.equal(summary[0].currency, "EUR");
  assert.equal(summary[0].total, 199.9);
  assert.equal(summary[0].count, 2);
  assert.equal(summary[1].currency, "USD");
  assert.equal(summary[1].total, 40);
  assert.equal(summary[1].count, 1);
  assert.equal(gd.costSummary(equipment, "G3").length, 0);
});

test("costSummary with schema-valid adapter records", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const gd = window.LeafGuru.growDomain;
  const grow = await storage.put("grows", { name: "Costed", status: "active" });
  await storage.put("equipment", { name: "LED", category: "light", status: "in-use", growId: grow.id, cost: 200, currency: "EUR" });
  await storage.put("equipment", { name: "Pot", category: "pot", status: "in-use", growId: grow.id, cost: 5, currency: "EUR" });
  const equipment = await storage.list("equipment");
  const summary = gd.costSummary(equipment, grow.id);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].total, 205);
  assert.equal(gd.equipmentOf(equipment, grow.id).length, 2);
});

test("stageProgress: day count vs strain template expectation", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const plant = { id: "p1", stage: "vegetative" };
  const logs = [{ plantId: "p1", stage: "vegetative", enteredAt: "2026-09-01T00:00:00Z", leftAt: null }];

  // no template → null
  assert.equal(d.stageProgress({ plant, stageLogs: logs, strainTemplate: null }), null);
  // template without this stage's duration → null
  assert.equal(d.stageProgress({
    plant, stageLogs: logs, strainTemplate: { stageDurations: { flowering: 60 } }
  }), null);
  // 12 days into a 30-day stage
  const progress = d.stageProgress({
    plant, stageLogs: logs,
    strainTemplate: { stageDurations: { vegetative: 30 } },
    now: "2026-09-13T00:00:00Z"
  });
  assert.equal(progress.day, 12);
  assert.equal(progress.expected, 30);
  assert.equal(progress.remaining, 18);
  assert.equal(progress.overdue, false);
  // 35 days into a 30-day stage → overdue
  const overdue = d.stageProgress({
    plant, stageLogs: logs,
    strainTemplate: { stageDurations: { vegetative: 30 } },
    now: "2026-10-06T00:00:00Z"
  });
  assert.equal(overdue.day, 35);
  assert.equal(overdue.remaining, -5);
  assert.equal(overdue.overdue, true);
  // no open log → null
  assert.equal(d.stageProgress({
    plant, stageLogs: [], strainTemplate: { stageDurations: { vegetative: 30 } }
  }), null);
});

test("stageProgress end-to-end: plant detail data shape via adapter", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const d = window.LeafGuru.plantDomain;
  const tpl = await storage.put("strainTemplates", {
    name: "Fast One", genotype: "hybrid", stageDurations: { seedling: 14, vegetative: 21 }
  });
  const plant = await storage.put("plants", {
    name: "Timed", strainTemplateId: tpl.id, customStrain: null, sex: "unknown",
    stage: "vegetative", status: "growing"
  });
  const { plant: p2, stageLogs } = d.applyStageChange({
    plant, stageLogs: [], newStage: "vegetative", at: "2026-09-01T00:00:00Z"
  });
  await storage.put("plants", p2);
  for (const log of stageLogs) await storage.put("stageLogs", log);

  // the exact lookup the Plants detail performs:
  const [fresh, logs] = await Promise.all([
    storage.get("plants", plant.id), storage.list("stageLogs")
  ]);
  const template = fresh.strainTemplateId
    ? await storage.get("strainTemplates", fresh.strainTemplateId) : null;
  const progress = d.stageProgress({
    plant: fresh, stageLogs: logs, strainTemplate: template,
    now: "2026-09-13T00:00:00Z"
  });
  assert.equal(progress.day, 12);
  assert.equal(progress.expected, 21);
  assert.equal(progress.remaining, 9);
  assert.equal(progress.overdue, false);
});