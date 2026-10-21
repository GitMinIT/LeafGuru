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

test("harvestSummary: null when no harvested plants in the grow", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const plants = [
    { growId: "G1", status: "growing", stage: "vegetative" },
    { growId: "G2", status: "cured", stage: "cured" }
  ];
  assert.equal(gd.harvestSummary({ plants, equipmentList: [], growId: "G1" }), null);
});

test("harvestSummary: counts, yield totals and cost-per-gram", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const plants = [
    { growId: "G1", status: "cured", stage: "cured", harvestYieldG: 42.5 },
    { growId: "G1", status: "harvested", stage: "drying", harvestYieldG: 31 },
    { growId: "G1", status: "growing", stage: "flowering", harvestYieldG: null }, // still growing
    { growId: "G1", status: "died", stage: "seedling" },                          // died early
    { growId: "G1", status: "harvested", stage: "drying", harvestYieldG: null }   // no yield yet
  ];
  const equipment = [
    { growId: "G1", cost: 189.9, currency: "EUR" },
    { growId: "G1", cost: 24.5, currency: "EUR" },
    { growId: "G1", cost: 10, currency: "USD" }
  ];
  const summary = gd.harvestSummary({ plants, equipmentList: equipment, growId: "G1" });
  assert.equal(summary.plantCount, 3, "cured + harvested×2 reached harvest");
  assert.equal(summary.withYield, 2);
  assert.equal(summary.totalYieldG, 73.5);
  assert.equal(summary.avgYieldG, 36.75);
  assert.equal(summary.costPerG.length, 2);
  const eur = summary.costPerG.find((c) => c.currency === "EUR");
  assert.equal(eur.total, 214.4);
  assert.ok(Math.abs(eur.costPerG - 214.4 / 73.5) < 1e-9);
  const usd = summary.costPerG.find((c) => c.currency === "USD");
  assert.equal(usd.costPerG, 10 / 73.5);
  // zero yield → no cost-per-gram entries
  const noYield = gd.harvestSummary({
    plants: [{ growId: "G1", status: "harvested", stage: "harvest", harvestYieldG: null }],
    equipmentList: equipment, growId: "G1"
  });
  assert.equal(noYield.plantCount, 1);
  assert.equal(noYield.totalYieldG, 0);
  assert.equal(noYield.costPerG.length, 0);
});

test("harvestSummary with schema-valid adapter records (new plant fields)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const gd = window.LeafGuru.growDomain;
  const grow = await storage.put("grows", { name: "Finished", status: "closed" });
  await storage.put("plants", {
    name: "Berry", strainTemplateId: null, customStrain: null, sex: "female",
    germinationDate: "2026-05-04", stage: "cured", status: "cured",
    growId: grow.id, harvestYieldG: 42.5, harvestedAt: "2026-07-16"
  });
  await storage.put("equipment", {
    name: "LED", category: "light", status: "stored", growId: grow.id, cost: 189.9, currency: "EUR"
  });
  const plants = await storage.list("plants");
  const equipment = await storage.list("equipment");
  const summary = gd.harvestSummary({ plants, equipmentList: equipment, growId: grow.id });
  assert.equal(summary.plantCount, 1);
  assert.equal(summary.totalYieldG, 42.5);
  assert.equal(summary.costPerG[0].costPerG, 189.9 / 42.5);
});

test("isHarvested: status- or stage-based", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  assert.equal(gd.isHarvested({ status: "growing", stage: "flowering" }), false);
  assert.equal(gd.isHarvested({ status: "died", stage: "seedling" }), false);
  assert.equal(gd.isHarvested({ status: "harvested", stage: "flowering" }), true);
  assert.equal(gd.isHarvested({ status: "growing", stage: "harvest" }), true);
  assert.equal(gd.isHarvested({ status: "growing", stage: "drying" }), true);
  assert.equal(gd.isHarvested({ status: "fermented", stage: "fermented" }), true);
  assert.equal(gd.isHarvested({ status: "cured", stage: "cured" }), true);
});

test("harvestSummary includes trim parts (buds/leaves/sugar leaves/stems)", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const plants = [
    { growId: "G1", status: "cured", stage: "cured", harvestYieldG: 42.5,
      budG: 38.5, leafG: 6.2, sugarLeafG: 4.1, stemG: 9.4 },
    { growId: "G1", status: "cured", stage: "cured", harvestYieldG: 31,
      budG: 27, leafG: 5, sugarLeafG: 3.2, stemG: 7.8 }
  ];
  const summary = gd.harvestSummary({ plants, equipmentList: [], growId: "G1" });
  assert.equal(summary.totalBudG, 65.5);
  assert.equal(summary.totalLeafG, 11.2);
  assert.equal(summary.totalSugarLeafG, 7.3);
  assert.equal(summary.totalStemG, 17.2);
  // missing parts count as 0, not null
  const sparse = gd.harvestSummary({
    plants: [{ growId: "G1", status: "harvested", stage: "harvest", harvestYieldG: 10 }],
    equipmentList: [], growId: "G1"
  });
  assert.equal(sparse.totalBudG, 0);
  assert.equal(sparse.totalStemG, 0);
});

test("defaultGrowId: flagged grow wins, falls back to first active, else null", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const grows = [
    { id: "a", name: "Summer", status: "closed", isDefault: false },
    { id: "b", name: "Autumn", status: "active", isDefault: false },
    { id: "c", name: "Winter", status: "planned", isDefault: true }
  ];
  assert.equal(gd.defaultGrowId(grows), "c", "flag beats active");
  assert.equal(gd.defaultGrowId(grows.map((g) => ({ ...g, isDefault: false }))), "b",
    "first active as fallback");
  assert.equal(gd.defaultGrowId([
    { id: "x", name: "Old", status: "closed", isDefault: false }
  ]), null, "no default, no active");
  assert.equal(gd.defaultGrowId([]), null);
  assert.equal(gd.defaultGrowId(null), null);
});

test("stageAverages: actual durations across a grow's plants", async () => {
  const { window } = await setup();
  const gd = window.LeafGuru.growDomain;
  const plants = [{ id: "p1", growId: "G1" }, { id: "p2", growId: "G1" }, { id: "pX", growId: "G2" }];
  const day = (n) => `2026-05-${String(n).padStart(2, "0")}T00:00:00.000Z`;
  const stageLogs = [
    { plantId: "p1", stage: "seedling", enteredAt: day(1), leftAt: day(11) },   // 10d
    { plantId: "p2", stage: "seedling", enteredAt: day(3), leftAt: day(11) },  // 8d
    { plantId: "pX", stage: "seedling", enteredAt: day(1), leftAt: day(30) },  // other grow → excluded
    { plantId: "p1", stage: "vegetative", enteredAt: day(11), leftAt: null }, // open → excluded
    { plantId: "p2", stage: "flowering", enteredAt: day(11), leftAt: day(20) } // 9d
  ];
  const averages = gd.stageAverages({ plants, stageLogs, growId: "G1" });
  assert.deepEqual(Object.keys(averages), ["seedling", "flowering"], "lifecycle order, only stages with data");
  assert.equal(averages.seedling.count, 2);
  assert.equal(averages.seedling.avgDays, 9);
  assert.equal(averages.seedling.minDays, 8);
  assert.equal(averages.seedling.maxDays, 10);
  assert.equal(averages.flowering.count, 1);
  assert.equal(averages.flowering.avgDays, 9);
  assert.equal(Object.keys(gd.stageAverages({ plants: [], stageLogs, growId: "G1" })).length, 0);
});

test("growth chart integration: multi-series + expected-height overlay via adapter records", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const chart = window.LeafGuru.chart;
  const tpl = await storage.put("strainTemplates", {
    name: "Purple Sunset", genotype: "indica",
    stageDurations: { seedling: 14, vegetative: 35, flowering: 60 },
    expectedHeightCm: 110
  });
  const grow = await storage.put("grows", { name: "Autumn", status: "active" });
  const alpha = await storage.put("plants", {
    name: "Alpha", strainTemplateId: tpl.id, customStrain: null, sex: "female",
    stage: "flowering", status: "growing", growId: grow.id
  });
  const beta = await storage.put("plants", {
    name: "Beta", strainTemplateId: tpl.id, customStrain: null, sex: "female",
    stage: "flowering", status: "growing", growId: grow.id
  });
  const unlinked = await storage.put("plants", {
    name: "Other grow", strainTemplateId: null, customStrain: null, sex: "female",
    stage: "seedling", status: "growing"
  });
  const mk = (plant, day, value) => ({
    plantId: plant.id, type: "height", value, unit: "cm",
    measuredAt: `2026-09-${String(day).padStart(2, "0")}T09:00:00Z`, note: ""
  });
  for (const m of [mk(alpha, 1, 5), mk(alpha, 8, 12), mk(alpha, 15, 24), mk(beta, 2, 4), mk(beta, 9, 10)])
    await storage.put("measurements", m);
  await storage.put("measurements", mk(unlinked, 1, 99)); // other plant → excluded

  // the exact flow the Grows detail performs:
  const [plants, measurements] = await Promise.all([
    storage.list("plants"), storage.list("measurements")
  ]);
  const growPlants = plants.filter((p) => p.growId === grow.id);
  const series = growPlants
    .map((plant) => ({
      name: plant.name,
      points: chart.seriesFromMeasurements(
        measurements.filter((m) => m.plantId === plant.id), "height")
    }))
    .filter((s) => s.points.length > 0);
  assert.deepEqual(series.map((s) => s.name), ["Alpha", "Beta"]);
  assert.equal(series[0].points.length, 3);

  const { svg, legend } = chart.multiLineChart(series, {
    yLabel: "cm",
    hLines: [{ y: 110, label: "expected 110 cm" }]
  });
  assert.equal(svg.children.filter((c) => c.tag === "polyline").length, 2);
  assert.equal(legend.children.length, 2);
  assert.ok(svg.children.some((c) => c.tag === "line" && c.attrs.class === "chart-hline"),
    "expected-height overlay drawn");
});