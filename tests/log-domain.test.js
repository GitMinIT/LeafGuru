/** Unit tests: log domain — journal entry builder + summary line. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("buildEntry: full input builds a schema-valid record", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const ld = window.LeafGuru.logDomain;
  const grow = await storage.put("grows", { name: "G", status: "active" });
  const plant = await storage.put("plants", { name: "P", stage: "flowering", status: "growing" });

  const entry = ld.buildEntry({
    growId: grow.id, at: "2026-09-14T09:00:00.000Z",
    categories: ["watering", "feeding"],
    text: "  Watered the girls  ", amountL: "2", ph: "6.3", ec: "1.2", tempC: "22.5",
    plantIds: [plant.id], locationId: null
  });
  assert.equal(entry.text, "Watered the girls", "text trimmed");
  assert.deepEqual([...entry.categories], ["watering", "feeding"], "multi-category");
  assert.equal(entry.amountL, 2);
  assert.equal(entry.ph, 6.3);
  assert.equal(entry.ec, 1.2);
  assert.equal(entry.tempC, 22.5);
  assert.equal(entry.plantIds.length, 1);
  assert.equal(entry.plantIds[0], plant.id);
  assert.equal(entry.locationId, null);
  // persists through the adapter (schema-valid)
  const saved = await storage.put("logEntries", entry);
  assert.equal(saved.id, entry.id);
});

test("buildEntry: empty numbers become null, missing text/categories throw", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.logDomain;
  const entry = ld.buildEntry({
    growId: "grow-x", categories: ["note"], text: "hello",
    amountL: "", ph: null, ec: undefined, tempC: "abc"
  });
  assert.equal(entry.amountL, null);
  assert.equal(entry.ph, null);
  assert.equal(entry.ec, null);
  assert.equal(entry.tempC, null, "invalid number → null");
  assert.equal(entry.plantIds.length, 0);
  assert.ok(entry.at, "defaults to now");

  assert.throws(() => ld.buildEntry({ growId: "g", categories: ["note"], text: "  " }),
    /requires text/);
  assert.throws(() => ld.buildEntry({ growId: "g", text: "x" }), /at least one category/);
  assert.throws(() => ld.buildEntry({ growId: "g", categories: ["nonsense"], text: "x" }),
    /at least one category/);
  assert.throws(() => ld.buildEntry({ categories: ["note"], text: "x" }), /requires a growId/);
});

test("categoriesOf: multi wins, legacy single falls back", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.logDomain;
  assert.deepEqual([...ld.categoriesOf({ categories: ["watering", "note"] })], ["watering", "note"]);
  assert.deepEqual([...ld.categoriesOf({ category: "feeding" })], ["feeding"]);
  assert.equal(ld.categoriesOf({}).length, 0);
  assert.equal(ld.categoriesOf(null).length, 0);
});

test("buildEntry: category enum matches schema, empty optional fields pass validation", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const ld = window.LeafGuru.logDomain;
  const grow = await storage.put("grows", { name: "G", status: "active" });
  // minimal entry — all optional fields empty
  const entry = await storage.put("logEntries", ld.buildEntry({
    growId: grow.id, categories: ["observation"], text: "lookin good"
  }));
  assert.equal(entry.amountL, null);
  assert.equal(entry.ph, null);
  // all categories validate
  for (const category of ld.categories) {
    await storage.put("logEntries", ld.buildEntry({ growId: grow.id, categories: [category], text: "x" }));
  }
  const all = await storage.list("logEntries");
  assert.equal(all.length, 1 + ld.categories.length);
});

test("summaryLine: text plus numbers, i18n-free", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.logDomain;
  assert.equal(ld.summaryLine({ text: "watered", amountL: 2, ph: 6.3, ec: null, tempC: null }),
    "watered · 2 L · pH 6.3");
  assert.equal(ld.summaryLine({ text: "just a note" }), "just a note");
});