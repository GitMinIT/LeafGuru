/** Unit tests: history domain — per-grow event collection. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const G = "grow-1";

function baseData(overrides = {}) {
  return {
    plants: [{
      id: "p1", growId: G, name: "Alpha",
      germinationDate: "2026-05-04", harvestedAt: "2026-07-16", harvestYieldG: 42.5,
      status: "cured", stage: "cured"
    }],
    stageLogs: [
      { id: "s1", plantId: "p1", stage: "seedling", enteredAt: "2026-05-06T08:00:00Z", leftAt: "2026-05-16T08:00:00Z" },
      { id: "s2", plantId: "p1", stage: "flowering", enteredAt: "2026-06-13T08:00:00Z", leftAt: null }
    ],
    measurements: [
      { id: "m1", plantId: "p1", type: "height", value: 12, unit: "cm", measuredAt: "2026-05-20T09:00:00Z", note: "" }
    ],
    locationChanges: [
      { id: "c1", plantId: "p1", fromLocationId: "L1", toLocationId: "L2", changedAt: "2026-05-18T09:00:00Z", reason: "more light" }
    ],
    tasks: [
      { id: "t1", growId: G, title: "Water Alpha", dueDate: "2026-05-19", status: "open", priority: "high", description: "2L" },
      { id: "t2", growId: G, title: "Clean tent", dueDate: null, status: "done", completedAt: "2026-07-20T10:00:00Z", priority: "low" },
      { id: "t3", growId: G, title: "Skip me", dueDate: null, status: "skipped", completedAt: "2026-07-21T10:00:00Z", priority: "low" },
      { id: "tX", growId: "other", title: "Not mine", dueDate: "2026-05-19", status: "open", priority: "low" }
    ],
    equipment: [
      { id: "e1", growId: G, name: "LED", category: "light", purchaseDate: "2026-04-20", cost: 189.9, currency: "EUR", status: "in-use",
        locationAssignments: [{ locationId: "L1", from: "2026-05-04T08:00:00Z", to: null }] },
      { id: "e2", growId: "other", name: "Not mine", category: "fan", status: "stored", locationAssignments: [] },
      { id: "e3", growId: null, name: "pH meter", category: "sensor", purchaseDate: "2026-04-15", cost: 32, currency: "EUR",
        status: "in-use", availableEverywhere: true, locationAssignments: [] }
    ],
    photos: [
      { id: "ph1", plantId: "p1", takenAt: "2026-05-30T09:00:00Z", note: "looking good", phaseTag: "vegetative" }
    ],
    locations: [{ id: "L1", name: "Box" }, { id: "L2", name: "Balcony" }],
    strainTemplates: [],
    logEntries: [
      { id: "le1", growId: G, at: "2026-05-19T18:30:00Z", categories: ["watering"],
        text: "watered 2L pH 6.3", amountL: 2, ph: 6.3, ec: null, tempC: null,
        plantIds: ["p1"], locationId: "L1" },
      { id: "le2", growId: "other", at: "2026-05-19T18:30:00Z", categories: ["note"], text: "not mine" }
    ],
    ...overrides
  };
}

test("eventsForGrow: chronological, complete, scoped to the grow", async () => {
  const { window } = await setup();
  const hd = window.LeafGuru.historyDomain;
  const events = hd.eventsForGrow({ id: G, name: "Summer", locationIds: ["L1"], startDate: "2026-05-04", endDate: "2026-07-28" }, baseData());

  // every event sorted ascending by date; stage events anchor on enteredAt
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i - 1].at.localeCompare(events[i].at) <= 0,
      `${events[i - 1].at} <= ${events[i].at}`);
  }
  assert.equal(events[0].at, "2026-04-15", "shared equipment purchase first");
  assert.equal(events.at(-1).at, "2026-07-28", "grow end last");
  assert.equal(events.filter((e) => e.at === "2026-05-04").length, 3,
    "grow start + LED assignment + germination on the same day");

  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes("growStart") && kinds.includes("growEnd"));
  assert.ok(kinds.includes("germination"));
  assert.ok(kinds.filter((k) => k === "stage").length === 2);
  assert.ok(kinds.includes("measurement"));
  assert.ok(kinds.includes("locationChange"));
  assert.ok(kinds.includes("photo"));
  assert.ok(kinds.includes("taskPlanned"));
  assert.ok(kinds.includes("taskDone"));
  assert.ok(kinds.includes("taskSkipped"));
  assert.ok(kinds.includes("equipmentPurchase"));
  assert.ok(kinds.includes("equipmentAssignment"));
  assert.ok(kinds.includes("log"), "journal entry collected");
  // other grow's records are excluded
  assert.ok(!events.some((e) => e.title === "Not mine"));
  assert.ok(!events.some((e) => e.kind === "log" && e.record.id === "le2"));
  // journal event carries plant + fields
  const logEvent = events.find((e) => e.kind === "log");
  assert.equal(logEvent.record.amountL, 2);
  assert.equal(logEvent.plant.name, "Alpha");
});

test("eventsForGrow: every event carries its full record + plant resolution", async () => {
  const { window } = await setup();
  const hd = window.LeafGuru.historyDomain;
  const events = hd.eventsForGrow({ id: G, name: "Summer", locationIds: ["L1"] }, baseData());

  const stage = events.find((e) => e.kind === "stage" && e.record.stage === "seedling");
  assert.equal(stage.record.id, "s1");
  assert.equal(stage.plant.name, "Alpha");
  assert.equal(stage.atEnd, "2026-05-16");
  const measurement = events.find((e) => e.kind === "measurement");
  assert.equal(measurement.record.value, 12);
  assert.equal(measurement.plant.name, "Alpha");
  const assignment = events.find((e) => e.kind === "equipmentAssignment");
  assert.equal(assignment.location.name, "Box");
  const harvest = events.find((e) => e.kind === "harvest");
  assert.equal(harvest.record.harvestYieldG, 42.5);
});

test("eventsForGrow: no grow → empty; no data → empty", async () => {
  const { window } = await setup();
  const hd = window.LeafGuru.historyDomain;
  assert.equal(hd.eventsForGrow(null, baseData()).length, 0);
  assert.equal(hd.eventsForGrow({ id: G }, null).length, 0);
  // plant events require growId match — unassigned plants never appear
  const events = hd.eventsForGrow({ id: G, name: "Empty" }, {
    plants: [{ id: "pZ", growId: null, name: "Free" }]
  });
  assert.equal(events.length, 0);
  // ...but equipment of unassigned grows still appears if shared
  const shared = hd.eventsForGrow({ id: G, name: "Shared" }, {
    plants: [],
    equipment: [{ id: "e", growId: null, name: "pH", category: "sensor",
      status: "in-use", purchaseDate: "2026-04-15", availableEverywhere: true, locationAssignments: [] }]
  });
  assert.equal(shared.length, 1, "availableEverywhere equipment belongs to every grow's history");
});