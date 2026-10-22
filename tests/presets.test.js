/** Unit tests: the journal presets (one-tap entries). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("there are presets, and every one has an id, a category and a text", async () => {
  const { window } = await setup();
  const presets = window.LeafGuru.presets.PRESETS;
  assert.ok(presets.length >= 4, "a beginner needs more than a couple of options");
  const ids = new Set();
  for (const preset of presets) {
    assert.ok(preset.id, "a preset needs an id");
    assert.ok(!ids.has(preset.id), `duplicate preset id: ${preset.id}`);
    ids.add(preset.id);
    assert.ok(preset.category, "a preset needs a category");
    assert.ok(preset.text, "a preset needs a default text");
    assert.ok(preset.icon, "a preset needs an icon");
  }
});

test("every preset category is a category the journal knows", async () => {
  const { window } = await setup();
  const known = window.LeafGuru.logDomain.categories;
  for (const preset of window.LeafGuru.presets.PRESETS) {
    assert.ok(known.includes(preset.category),
      `${preset.id}: "${preset.category}" is not a log category`);
  }
});

test("byId finds a preset and returns null for an unknown one", async () => {
  const { window } = await setup();
  const p = window.LeafGuru.presets;
  assert.equal(p.byId("watering").category, "watering");
  assert.equal(p.byId("nonsense"), null);
});

test("buildPresetEntry makes a schema-valid entry", async () => {
  const { window } = await setup();
  const entry = window.LeafGuru.presets.buildPresetEntry({
    presetId: "watering", growId: "11111111-1111-4111-8111-111111111111"
  });
  assert.equal(entry.growId, "11111111-1111-4111-8111-111111111111");
  assert.equal(entry.text, "Watered");
  assert.deepEqual([...entry.categories], ["watering"]);
  assert.ok(entry.id);
  assert.ok(entry.at);
});

test("buildPresetEntry accepts a custom text and plants", async () => {
  const { window } = await setup();
  const entry = window.LeafGuru.presets.buildPresetEntry({
    presetId: "feeding", growId: "11111111-1111-4111-8111-111111111111", text: "Fed 1L", plantIds: ["22222222-2222-4222-8222-222222222222"]
  });
  assert.equal(entry.text, "Fed 1L");
  assert.deepEqual([...entry.plantIds], ["22222222-2222-4222-8222-222222222222"]);
  assert.deepEqual([...entry.categories], ["feeding"]);
});

test("buildPresetEntry rejects an unknown preset and a missing grow", async () => {
  const { window } = await setup();
  const p = window.LeafGuru.presets;
  assert.throws(() => p.buildPresetEntry({ presetId: "nope", growId: "11111111-1111-4111-8111-111111111111" }), /unknown preset/);
  assert.throws(() => p.buildPresetEntry({ presetId: "watering", growId: null }), /needs a growId/);
});

test("a preset entry passes the journal entry schema", async () => {
  const { window } = await setup();
  const entry = window.LeafGuru.presets.buildPresetEntry({
    presetId: "observation", growId: "11111111-1111-4111-8111-111111111111"
  });
  const check = window.LeafGuru.validator.validate(
    entry, window.LeafGuru.schemas["log-entry.schema.json"]);
  assert.ok(check.valid, JSON.stringify(check.errors));
});
