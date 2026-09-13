/** Unit tests: plant domain logic (stage transitions, moves, measurements). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const UUID = "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d";
const plant = (over = {}) => ({ id: UUID, name: "P", stage: "seedling", status: "growing", ...over });

test("applyStageChange closes open log and opens the new stage", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const p = plant({ stage: "seedling" });
  const logs = [{ id: "log-1", plantId: UUID, stage: "seedling", enteredAt: "2026-09-01T10:00:00Z", leftAt: null }];

  const { plant: p2, stageLogs } = d.applyStageChange({ plant: p, stageLogs: logs, newStage: "vegetative", at: "2026-09-10T10:00:00Z" });

  assert.equal(p2.stage, "vegetative");
  const closed = stageLogs.find((l) => l.id === "log-1");
  assert.equal(closed.leftAt, "2026-09-10T10:00:00Z");
  const open = stageLogs.filter((l) => l.leftAt == null);
  assert.equal(open.length, 1);
  assert.equal(open[0].stage, "vegetative");
  assert.equal(open[0].plantId, UUID);
});

test("applyStageChange without prior log just opens one", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const { stageLogs } = d.applyStageChange({ plant: plant(), stageLogs: [], newStage: "germinating" });
  assert.equal(stageLogs.length, 1);
  assert.equal(stageLogs[0].stage, "germinating");
});

test("applyStageChange rejects unknown stage", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  assert.throws(() => d.applyStageChange({ plant: plant(), stageLogs: [], newStage: "dancing" }), /unknown stage/);
});

test("applyLocationChange records from→to and updates plant", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const p = plant({ locationId: "11111111-1c2d-4e5f-9a8b-3c2b1a0f9e8d" });
  const { plant: p2, locationChange } = d.applyLocationChange({
    plant: p, toLocationId: "22222222-1c2d-4e5f-9a8b-3c2b1a0f9e8d", reason: "summer", at: "2026-09-10T10:00:00Z"
  });
  assert.equal(p2.locationId, "22222222-1c2d-4e5f-9a8b-3c2b1a0f9e8d");
  assert.equal(locationChange.fromLocationId, "11111111-1c2d-4e5f-9a8b-3c2b1a0f9e8d");
  assert.equal(locationChange.reason, "summer");
});

test("applyLocationChange to null (unassign) records null target", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const p = plant({ locationId: "11111111-1c2d-4e5f-9a8b-3c2b1a0f9e8d" });
  const { plant: p2, locationChange } = d.applyLocationChange({ plant: p, toLocationId: null });
  assert.equal(p2.locationId, null);
  assert.equal(locationChange.toLocationId, null);
});

test("applyLocationChange: same location → no-op, no record", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const p = plant({ locationId: "11111111-1c2d-4e5f-9a8b-3c2b1a0f9e8d" });
  const res = d.applyLocationChange({ plant: p, toLocationId: "11111111-1c2d-4e5f-9a8b-3c2b1a0f9e8d" });
  assert.equal(res.locationChange, null);
});

test("buildMeasurement shape", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const m = d.buildMeasurement({ plant: plant(), type: "height", value: 12.5, unit: "cm", note: "fast" });
  assert.equal(m.plantId, UUID);
  assert.equal(m.type, "height");
  assert.equal(m.value, 12.5);
  assert.equal(m.unit, "cm");
  assert.ok(m.measuredAt);
});

test("daysSince computes whole days", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  assert.equal(d.daysSince("2026-09-10T10:00:00Z", "2026-09-13T10:00:00Z"), 3);
  assert.equal(d.daysSince("2026-09-10T10:00:00Z", "2026-09-13T09:59:00Z"), 2);
  assert.equal(d.daysSince(null), null);
});

test("timelineFor sorts chronologically", async () => {
  const { window } = await setup();
  const d = window.LeafGuru.plantDomain;
  const logs = [
    { plantId: UUID, stage: "vegetative", enteredAt: "2026-09-10T10:00:00Z", leftAt: null },
    { plantId: UUID, stage: "seedling", enteredAt: "2026-09-01T10:00:00Z", leftAt: "2026-09-10T10:00:00Z" },
    { plantId: "other", stage: "seedling", enteredAt: "2026-09-02T10:00:00Z", leftAt: null }
  ];
  const tl = d.timelineFor(logs, UUID);
  assert.deepEqual(tl.map((l) => l.stage), ["seedling", "vegetative"]);
});

test("domain persistence: stage change round-trips through adapter", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const d = window.LeafGuru.plantDomain;
  // plant creation always opens the initial StageLog (page uses same flow)
  const created = await storage.put("plants", { name: "P", stage: "seedling", status: "growing" });
  const { stageLogs: initial } = d.applyStageChange({ plant: created, stageLogs: [], newStage: "seedling" });
  for (const log of initial) await storage.put("stageLogs", log);

  const p = await storage.get("plants", created.id);
  const logs = await storage.list("stageLogs");
  const { plant: p2, stageLogs: logs2 } = d.applyStageChange({ plant: p, stageLogs: logs, newStage: "vegetative" });
  await storage.put("plants", p2);
  for (const log of logs2) await storage.put("stageLogs", log);

  const storedPlant = await storage.get("plants", created.id);
  assert.equal(storedPlant.stage, "vegetative");
  const storedLogs = await storage.list("stageLogs");
  assert.equal(storedLogs.length, 2);
  assert.equal(d.openStage(storedLogs, created.id).stage, "vegetative");
  assert.ok(storedLogs.every((l) => l.plantId === created.id));
});