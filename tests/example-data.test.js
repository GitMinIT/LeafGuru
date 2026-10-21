/**
 * Example dataset: examples/leafguru-example.json must validate against
 * the bundle schema and import cleanly through the real adapter — the
 * same path the Data page uses.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./helpers/browser-stub");

const EXAMPLE = path.join(__dirname, "..", "examples", "leafguru-example.json");

test("example bundle validates against all schemas", async () => {
  const { window } = await setup();
  const bundle = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));
  const check = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
  assert.equal(check.valid, true, JSON.stringify(check.errors.slice(0, 5)));
});

test("example bundle imports through the adapter and stats hold", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  const bundle = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));

  await storage.importBundle(bundle);
  const [grows, plants, stageLogs, measurements, tasks, equipment, locations, locationChanges, logEntries, photos] = await Promise.all([
    storage.list("grows"), storage.list("plants"), storage.list("stageLogs"),
    storage.list("measurements"), storage.list("tasks"), storage.list("equipment"),
    storage.list("locations"), storage.list("locationChanges"),
    storage.list("logEntries"), storage.list("photos")
  ]);
  assert.equal(grows.length, 2);
  assert.equal(plants.length, 4);
  assert.equal(stageLogs.length, 20);
  assert.equal(measurements.length, 7);
  assert.equal(tasks.length, 4);
  assert.equal(equipment.length, 4);
  assert.equal(logEntries.length, 4, "journal entries imported");

  // harvest statistics for the finished grow
  const gd = window.LeafGuru.growDomain;
  const summer = grows.find((g) => g.name.includes("Summer"));
  const summary = gd.harvestSummary({ plants, equipmentList: equipment, growId: summer.id });
  assert.equal(summary.plantCount, 2);
  assert.equal(summary.totalYieldG, 73.5);
  assert.equal(summary.costPerG[0].currency, "EUR");
  assert.equal(summary.costPerG[0].total, 214.4);
  assert.equal(summary.totalBudG, 65.5, "bud grams summed");
  assert.equal(summary.totalLeafG, 11.2);
  assert.equal(summary.totalSugarLeafG, 7.3);
  assert.equal(summary.totalStemG, 17.2);
  // the autumn grow carries the default flag
  const autumn = grows.find((g) => g.name.includes("Autumn"));
  assert.equal(autumn.isDefault, true, "example flags the active grow as default");
  assert.equal(summer.isDefault, false);

  // stage durations for the finished grow
  const averages = gd.stageAverages({ plants, stageLogs, growId: summer.id });
  assert.equal(averages.seedling.count, 2);
  assert.equal(averages.seedling.avgDays, 10);
  assert.equal(averages.flowering.avgDays, 33);

  // active grow must NOT have a harvest summary
  assert.equal(gd.harvestSummary({ plants, equipmentList: equipment, growId: autumn.id }), null);

  // timeline events exist for the example dates
  const tl = window.LeafGuru.timelineDomain;
  const events = tl.eventsForDate("2026-07-16", { grows, plants, stageLogs, tasks });
  assert.ok(events.some((e) => e.kind === "harvest" && e.plantName === "Berry #1"));
  assert.ok(events.some((e) => e.kind === "stage"));

  // per-grow history covers the event kinds of the finished grow
  const hd = window.LeafGuru.historyDomain;
  const history = hd.eventsForGrow(summer, {
    plants, stageLogs, measurements, locationChanges, tasks, equipment,
    photos: [], locations, strainTemplates: [], logEntries
  });
  const kinds = history.map((e) => e.kind);
  for (const expected of ["growStart", "growEnd", "germination", "stage", "harvest",
    "taskDone", "equipmentPurchase", "equipmentAssignment"]) {
    assert.ok(kinds.includes(expected), `history includes ${expected}`);
  }
  assert.equal(history.at(-1).at, "2026-08-01", "last event is the completed cleanup task (after grow end)");
  // active grow has measurements and open tasks planned, but no harvest
  const autumnHistory = hd.eventsForGrow(autumn, {
    plants, stageLogs, measurements, locationChanges, tasks, equipment,
    photos: [], locations, strainTemplates: [], logEntries
  });
  const autumnKinds = autumnHistory.map((e) => e.kind);
  assert.ok(autumnKinds.includes("taskPlanned"));
  assert.ok(autumnKinds.includes("measurement"), "measurements belong to the active grow's plants");
  assert.ok(!autumnKinds.includes("harvest"));
  // journal entries appear in both histories, with photos linked
  assert.ok(autumnKinds.includes("log"), "active grow shows journal entries");
  assert.ok(kinds.includes("log"), "summer grow shows the flush entry");
  const obsEntry = autumnHistory.find((e) => e.kind === "log" && e.record.text.includes("pistils"));
  assert.ok(obsEntry, "observation entry present");
  const linked = photos.filter((p) => p.logEntryId === obsEntry.record.id);
  assert.equal(linked.length, 1, "photo linked via logEntryId");
  assert.equal(linked[0].mimeType, "image/png");
});

test("example bundle survives an export round-trip", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  const bundle = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));
  await storage.importBundle(bundle);
  const reExported = await storage.exportBundle();
  const check = window.LeafGuru.validator.validateBundle(reExported, window.LeafGuru.schemas);
  assert.equal(check.valid, true);
  assert.equal(reExported.plants.length, 4);
  assert.equal(reExported.plants.find((p) => p.name === "Berry #1").harvestYieldG, 42.5);
});