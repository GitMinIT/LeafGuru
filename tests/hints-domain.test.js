/** Unit tests: the care-hints engine (tone, silence, and no invented data). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const NOW = "2026-09-13T12:00:00Z";

const grow = (over = {}) => ({
  id: "g1", name: "Spring", status: "active", startDate: "2026-03-01",
  isDefault: true, locationIds: [], notes: null,
  createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z",
  ...over
});
const plant = (over = {}) => ({
  id: "p1", growId: "g1", name: "Big Ben", stage: "vegetative", status: "growing",
  strainTemplateId: "s1", germinationDate: "2026-03-05", locationId: "l1",
  customStrain: null, sex: "unknown", notes: null,
  createdAt: "2026-03-05T00:00:00Z", updatedAt: "2026-03-05T00:00:00Z",
  ...over
});

async function hints(state, opts) {
  const { window } = await setup();
  return window.LeafGuru.hintsDomain.compute(state, { now: NOW, ...opts });
}

test("an empty app produces no hints — silence is fine", async () => {
  const out = await hints({});
  assert.equal(out.length, 0);
});

test("a healthy app produces no hints", async () => {
  const out = await hints({
    // a recent grow, so the "running a long time" info hint stays quiet
    grows: [grow({ startDate: "2026-09-01" })],
    plants: [plant()],
    tasks: [],
    logEntries: [
      // a recent watering, naming the plant (so it counts as journalled)
      {
        id: "l1", growId: "g1", at: "2026-09-12T08:00:00Z",
        categories: ["watering"], text: "watered", plantIds: ["p1"]
      }
    ],
    sensorReadings: [
      { id: "r1", growId: "g1", metric: "temperature", value: 22, recordedAt: "2026-09-13T11:00:00Z" }
    ]
  });
  assert.equal(out.length, 0, JSON.stringify(out));
});

test("an overdue task produces one attention hint", async () => {
  const out = await hints({
    tasks: [{
      id: "t1", title: "Water the tent", status: "open", dueDate: "2026-09-10",
      priority: "medium", growId: "g1", plantId: null, locationId: null,
      stageHint: null, description: null, completedAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }]
  });
  const taskHints = out.filter((h) => h.kind === "task");
  assert.equal(taskHints.length, 1);
  assert.equal(taskHints[0].severity, "attention");
  assert.equal(taskHints[0].title, "Water the tent");
  assert.match(taskHints[0].detail, /3 days ago/);
  assert.ok(taskHints[0].action?.label, "a hint without a next step is not worth showing");
});

test("a task due today is not yet overdue", async () => {
  const out = await hints({
    tasks: [{
      id: "t1", title: "Feed", status: "open", dueDate: "2026-09-13",
      priority: "medium", growId: null, plantId: null, locationId: null,
      stageHint: null, description: null, completedAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }]
  });
  assert.equal(out.filter((h) => h.kind === "task").length, 0);
});

test("no watering record at all means no watering hint — we do not nag about what we do not know", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()]
  });
  assert.equal(out.filter((h) => h.kind === "watering").length, 0);
});

test("a watering 4 days ago produces a gentle hint", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    logEntries: [
      { id: "l1", growId: "g1", at: "2026-09-09T08:00:00Z", categories: ["watering"], text: "watered" }
    ]
  });
  const watering = out.filter((h) => h.kind === "watering");
  assert.equal(watering.length, 1);
  // a day late is a thought, not an alarm
  assert.equal(watering[0].severity, "gentle");
  assert.match(watering[0].detail, /4 days ago/);
});

test("a watering 5 days ago escalates to attention", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    logEntries: [
      { id: "l1", growId: "g1", at: "2026-09-08T08:00:00Z", categories: ["watering"], text: "watered" }
    ]
  });
  const watering = out.filter((h) => h.kind === "watering");
  assert.equal(watering.length, 1);
  assert.equal(watering[0].severity, "attention", "5 days is well past the mark");
  assert.match(watering[0].detail, /5 days ago/);
});

test("a watering 2 days ago produces no hint", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    logEntries: [
      { id: "l1", growId: "g1", at: "2026-09-11T08:00:00Z", categories: ["watering"], text: "watered" }
    ]
  });
  assert.equal(out.filter((h) => h.kind === "watering").length, 0);
});

test("a sensor reading outside the band produces a hint with the band in it", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant({ stage: "vegetative" })],
    sensorReadings: [
      { id: "r1", growId: "g1", metric: "temperature", value: 32, recordedAt: "2026-09-13T11:00:00Z" }
    ]
  });
  const sensor = out.filter((h) => h.kind === "sensor");
  assert.equal(sensor.length, 1);
  assert.match(sensor[0].title, /Temperature/);
  assert.match(sensor[0].title, /high/);
  assert.match(sensor[0].detail, /19–27/);
});

test("a stale sensor reading is not judged", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    sensorReadings: [
      // 2 days old: too old to say anything about now
      { id: "r1", growId: "g1", metric: "temperature", value: 32, recordedAt: "2026-09-11T11:00:00Z" }
    ]
  });
  assert.equal(out.filter((h) => h.kind === "sensor").length, 0);
});

test("a reading inside the band produces no hint", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant({ stage: "vegetative" })],
    sensorReadings: [
      { id: "r1", growId: "g1", metric: "temperature", value: 23, recordedAt: "2026-09-13T11:00:00Z" }
    ]
  });
  assert.equal(out.filter((h) => h.kind === "sensor").length, 0);
});

test("the band follows the grow's stage — a seedling wants more humidity", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant({ stage: "seedling" })],
    sensorReadings: [
      // 55% humidity: fine for flowering, too dry for a seedling
      { id: "r1", growId: "g1", metric: "humidity", value: 55, recordedAt: "2026-09-13T11:00:00Z" }
    ]
  });
  const sensor = out.filter((h) => h.kind === "sensor");
  assert.equal(sensor.length, 1);
  assert.match(sensor[0].detail, /60–80/);
});

test("a plant past its strain's stage duration produces a gentle hint", async () => {
  const out = await hints({
    plants: [plant({ stage: "vegetative" })],
    strainTemplates: [{
      id: "s1", name: "Northern Lights", breeder: "Sensi", genotype: "hybrid",
      stageDurations: { vegetative: 20 }, expectedHeightCm: 180,
      characteristics: null, notes: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
    }],
    stageLogs: [{
      id: "sl1", plantId: "p1", stage: "vegetative",
      enteredAt: "2026-08-01T00:00:00Z", leftAt: null,
      createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z"
    }]
  });
  const stage = out.filter((h) => h.kind === "stage");
  assert.equal(stage.length, 1);
  assert.equal(stage[0].severity, "gentle");
  assert.match(stage[0].detail, /longer than Northern Lights/);
});

test("a plant inside its stage duration produces no hint", async () => {
  const out = await hints({
    plants: [plant({ stage: "vegetative" })],
    strainTemplates: [{
      id: "s1", name: "Northern Lights", breeder: "Sensi", genotype: "hybrid",
      stageDurations: { vegetative: 60 }, expectedHeightCm: 180,
      characteristics: null, notes: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
    }],
    stageLogs: [{
      id: "sl1", plantId: "p1", stage: "vegetative",
      enteredAt: "2026-09-01T00:00:00Z", leftAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }]
  });
  assert.equal(out.filter((h) => h.kind === "stage").length, 0);
});

test("a plant with no strain template produces no stage hint", async () => {
  const out = await hints({
    plants: [plant({ strainTemplateId: null })],
    stageLogs: [{
      id: "sl1", plantId: "p1", stage: "vegetative",
      enteredAt: "2026-01-01T00:00:00Z", leftAt: null,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"
    }]
  });
  assert.equal(out.filter((h) => h.kind === "stage").length, 0);
});

test("hints are sorted: attention first, then gentle, then info", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    tasks: [{
      id: "t1", title: "Overdue thing", status: "open", dueDate: "2026-09-01",
      priority: "medium", growId: "g1", plantId: null, locationId: null,
      stageHint: null, description: null, completedAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }],
    logEntries: [
      { id: "l1", growId: "g1", at: "2026-09-01T08:00:00Z", categories: ["watering"], text: "watered" }
    ]
  });
  const severities = out.map((h) => h.severity);
  const rank = { attention: 0, gentle: 1, info: 2 };
  for (let i = 1; i < severities.length; i++) {
    assert.ok(rank[severities[i - 1]] <= rank[severities[i]],
      `hints are out of order: ${severities.join(", ")}`);
  }
});

test("every hint carries an id, a kind, a title and a detail", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant()],
    tasks: [{
      id: "t1", title: "Thing", status: "open", dueDate: "2026-09-01",
      priority: "medium", growId: null, plantId: null, locationId: null,
      stageHint: null, description: null, completedAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }]
  });
  assert.ok(out.length > 0);
  for (const hint of out) {
    assert.ok(hint.id, "a hint needs a stable id");
    assert.ok(hint.kind, "a hint needs a kind");
    assert.ok(hint.title, "a hint needs a title");
    assert.ok(hint.detail, "a hint needs a detail");
    assert.ok(hint.action?.label, "a hint needs a next step");
    assert.ok(hint.action?.href, "a hint needs a next step");
  }
});

test("hint ids are unique", async () => {
  const out = await hints({
    grows: [grow()],
    plants: [plant(), plant({ id: "p2", name: "Second" })],
    tasks: [{
      id: "t1", title: "Thing", status: "open", dueDate: "2026-09-01",
      priority: "medium", growId: "g1", plantId: null, locationId: null,
      stageHint: null, description: null, completedAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z"
    }]
  });
  const ids = out.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate hint ids");
});

test("dominantStage is the most advanced growing plant in the grow", async () => {
  const { window } = await setup();
  const hd = window.LeafGuru.hintsDomain;
  const plants = [
    plant({ id: "a", stage: "seedling" }),
    plant({ id: "b", stage: "flowering" }),
    plant({ id: "c", stage: "vegetative" })
  ];
  assert.equal(hd.dominantStage(plants, "g1"), "flowering");
  // a harvested plant does not count
  assert.equal(hd.dominantStage([plant({ stage: "harvest", status: "harvested" })], "g1"), null);
});

test("lastEntry finds the newest entry of a category, and respects the grow", async () => {
  const { window } = await setup();
  const hd = window.LeafGuru.hintsDomain;
  const entries = [
    { id: "a", growId: "g1", at: "2026-09-01T00:00:00Z", categories: ["watering"] },
    { id: "b", growId: "g2", at: "2026-09-10T00:00:00Z", categories: ["watering"] },
    { id: "c", growId: "g1", at: "2026-09-05T00:00:00Z", categories: ["watering"] }
  ];
  assert.equal(hd.lastEntry(entries, "watering", "g1").id, "c");
  assert.equal(hd.lastEntry(entries, "watering").id, "b");
  assert.equal(hd.lastEntry(entries, "feeding"), null);
});
