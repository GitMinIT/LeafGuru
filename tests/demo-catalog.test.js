/**
 * Demo grow + strain catalog: the two "get a feeling for the app" paths.
 *
 * The demo bundle is generated at runtime (dates relative to now), so it
 * must be validated against the real schemas on every run — a demo that
 * fails to import is worse than no demo.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./helpers/browser-stub");

const CATALOG = path.join(__dirname, "..", "static", "js", "data", "strain-catalog.json");

async function boot(setupResult) {
  const vm = require("node:vm");
  const fs2 = require("node:fs");
  const target = { ...setupResult.window };
  const sandbox = new Proxy(target, {
    get(t, k) { return t[k]; },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const rel of ["static/js/model/demo-data.js", "static/js/model/strain-catalog.js"]) {
    vm.runInContext(fs2.readFileSync(rel, "utf8"), sandbox, { filename: rel });
  }
  return sandbox.window.LeafGuru;
}

// ---------------------------------------------------------------- demo grow

test("demo grow: bundle validates against the schema", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const bundle = LG.demoData.buildDemoGrow();
  const check = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
  assert.equal(check.valid, true, JSON.stringify(check.errors.slice(0, 6)));
});

test("demo grow: imports through the adapter and every entity is populated", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;

  await LG.demoData.seedDemoGrow(storage);

  const counts = {};
  for (const entity of ["grows", "locations", "equipment", "strainTemplates", "plants",
    "stageLogs", "measurements", "locationChanges", "tasks", "logEntries"]) {
    counts[entity] = (await storage.list(entity)).length;
  }
  assert.equal(counts.grows, 2, "one active + one archived grow");
  assert.equal(counts.locations, 2);
  assert.equal(counts.equipment, 8);
  assert.equal(counts.strainTemplates, 3);
  assert.equal(counts.plants, 6);
  assert.ok(counts.stageLogs > 15, "stage history for every plant");
  assert.ok(counts.measurements > 10, "height measurements");
  assert.equal(counts.locationChanges, 1, "one location move");
  assert.equal(counts.tasks, 8);
  assert.equal(counts.logEntries, 8, "journal entries");
});

test("demo grow: dates are relative to now, so it always looks in progress", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const bundle = LG.demoData.buildDemoGrow();
  const grow = bundle.grows.find((g) => g.status === "active");
  const daysSinceStart = Math.round((Date.now() - new Date(grow.startDate).getTime()) / 86400000);
  assert.ok(daysSinceStart > 50 && daysSinceStart < 70,
    `active grow started ~62 days ago (got ${daysSinceStart})`);

  // the newest journal entry is recent
  const newest = Math.max(...bundle.logEntries.map((l) => new Date(l.at).getTime()));
  const ageDays = Math.round((Date.now() - newest) / 86400000);
  assert.ok(ageDays <= 2, `newest journal entry is at most 2 days old (got ${ageDays})`);

  // the archived grow is in the past
  const archived = bundle.grows.find((g) => g.status === "closed");
  assert.ok(new Date(archived.endDate) < new Date(), "archived grow ended in the past");
});

test("demo grow: plants cover the stages and one has a harvest", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const bundle = LG.demoData.buildDemoGrow();
  const stages = new Set(bundle.plants.map((p) => p.stage));
  for (const expected of ["germinating", "seedling", "vegetative", "flowering", "cured"]) {
    assert.ok(stages.has(expected), `demo covers the ${expected} stage`);
  }
  const harvested = bundle.plants.filter((p) => p.harvestYieldG != null);
  assert.equal(harvested.length, 1, "one harvested plant with a yield");
  assert.ok(harvested[0].budG > 0, "harvest splits into buds");
  assert.ok(harvested[0].smellTerpenes, "harvest records smell/terpenes");
});

test("demo grow: every plant has an open stage log for its current stage", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const bundle = LG.demoData.buildDemoGrow();
  for (const plant of bundle.plants) {
    const logs = bundle.stageLogs.filter((l) => l.plantId === plant.id);
    const open = logs.filter((l) => l.leftAt == null);
    assert.equal(open.length, 1, `${plant.name} has exactly one open stage log`);
    assert.equal(open[0].stage, plant.stage, `${plant.name} open log matches its stage`);
    // logs must be chronological
    const times = logs.map((l) => new Date(l.enteredAt).getTime());
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1], `${plant.name} stage logs are chronological`);
    }
  }
});

test("demo grow: journal entries use only known categories and link plants", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const bundle = LG.demoData.buildDemoGrow();
  const known = new Set(["watering", "feeding", "training", "defoliation", "treatment",
    "observation", "fermentation", "note", "other"]);
  const plantIds = new Set(bundle.plants.map((p) => p.id));
  for (const entry of bundle.logEntries) {
    assert.ok(entry.categories.length > 0, "entry has at least one category");
    for (const c of entry.categories) assert.ok(known.has(c), `known category: ${c}`);
    assert.ok(entry.text.length > 0, "entry has text");
    for (const pid of entry.plantIds) assert.ok(plantIds.has(pid), "linked plant exists");
  }
});

test("demo grow: replaces previous data instead of merging", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;

  await storage.put("plants", { name: "Leftover", stage: "planned", status: "growing" });
  await LG.demoData.seedDemoGrow(storage);

  const plants = await storage.list("plants");
  assert.equal(plants.length, 6, "old plant gone — the demo replaces, not merges");
  assert.ok(!plants.some((p) => p.name === "Leftover"));
});

// ----------------------------------------------------------- strain catalog

test("strain catalog: file is well-formed and covers popular strains", async () => {
  const data = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  assert.equal(data.version, 1);
  assert.ok(Array.isArray(data.rows), "rows array");
  assert.ok(data.rows.length > 5000, `catalog is substantial (${data.rows.length})`);
  assert.ok(data.featuredCount > 100, "a curated popular subset exists");

  const nameIdx = data.columns.indexOf("name");
  const names = data.rows.map((r) => r[nameIdx]);
  for (const famous of ["White Widow", "Northern Lights", "Blue Dream", "Amnesia",
    "Purple Kush", "Haze", "OG Kush", "Jack Herer"]) {
    assert.ok(names.includes(famous), `catalog contains ${famous}`);
  }
});

test("strain catalog: search finds a strain by name", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  // serve the catalog file through the stubbed fetch
  window.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(CATALOG, "utf8")),
  });

  const hits = await LG.strainCatalog.search("white widow", 10);
  assert.ok(hits.length > 0, "search returns results");
  assert.equal(hits[0].name, "White Widow", "exact name ranks first");

  const byBreeder = await LG.strainCatalog.search("sensi seeds", 10);
  assert.ok(byBreeder.length > 0, "search also matches breeders");

  const none = await LG.strainCatalog.search("zzzznotastrain", 10);
  assert.equal(none.length, 0, "no match returns nothing");
});

test("strain catalog: empty query returns the popular set", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  window.fetch = async () => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(CATALOG, "utf8")),
  });
  const featured = await LG.strainCatalog.search("", 24);
  assert.ok(featured.length > 0, "popular strains are listed by default");
  assert.ok(featured.every((e) => e.featured), "default list is the featured subset");
  assert.ok(featured.length <= 24, "respects the limit");
});

test("strain catalog: a catalog entry becomes a valid strain template", async () => {
  const { window } = await setup();
  const LG = await boot({ window });
  window.fetch = async () => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(CATALOG, "utf8")),
  });

  const entry = await LG.strainCatalog.byName("White Widow");
  assert.ok(entry, "lookup by name works");
  const tpl = LG.strainCatalog.toTemplate(entry);

  const check = window.LeafGuru.validator.validate(
    tpl, window.LeafGuru.schemas["strain-template.schema.json"]);
  assert.equal(check.valid, true, JSON.stringify(check.errors ?? []).slice(0, 300));

  assert.equal(tpl.name, "White Widow");
  assert.equal(tpl.genotype, entry.genotype);
  assert.ok(tpl.stageDurations.seedling > 0, "seedling duration filled in");
  assert.ok(tpl.stageDurations.vegetative > 0, "vegetative duration filled in");
  assert.ok(tpl.stageDurations.flowering > 0, "flowering duration filled in");
  assert.ok(tpl.expectedHeightCm > 0, "expected height filled in");
  assert.match(tpl.id, /^[0-9a-f-]{36}$/i, "template has a uuid");
});
