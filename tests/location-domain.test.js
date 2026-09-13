/** Unit tests: location-domain — cross-entity back-references. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("currentLocationId: open assignment wins, null otherwise", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.locationDomain;
  assert.equal(ld.currentLocationId({
    locationAssignments: [{ locationId: "a", from: "2026-01-01T00:00:00Z", to: null }]
  }), "a");
  assert.equal(ld.currentLocationId({
    locationAssignments: [{ locationId: "a", from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" }]
  }), null);
  assert.equal(ld.currentLocationId({}), null);
});

test("equipmentAt: open assignments + availableEverywhere items", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.locationDomain;
  const equipment = [
    { id: "1", name: "LED", locationAssignments: [{ locationId: "L1", from: "2026-01-01T00:00:00Z", to: null }] },
    { id: "2", name: "Old fan", locationAssignments: [{ locationId: "L1", from: "2026-01-01T00:00:00Z", to: "2026-03-01T00:00:00Z" }] },
    { id: "3", name: "Global stuff", availableEverywhere: true },
    { id: "4", name: "Elsewhere", locationAssignments: [{ locationId: "L2", from: "2026-01-01T00:00:00Z", to: null }] }
  ];
  const atL1 = ld.equipmentAt(equipment, "L1");
  assert.deepEqual(atL1.map((e) => e.name).sort(), ["Global stuff", "LED"]);
});

test("plantsAt filters by current locationId", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.locationDomain;
  const plants = [
    { id: "1", name: "A", locationId: "L1" },
    { id: "2", name: "B", locationId: "L2" },
    { id: "3", name: "C", locationId: null }
  ];
  assert.deepEqual(ld.plantsAt(plants, "L1").map((p) => p.name), ["A"]);
  assert.deepEqual(ld.plantsAt(plants, "L9"), []);
});

test("growsUsing matches grow.locationIds", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.locationDomain;
  const grows = [
    { id: "1", name: "Summer", locationIds: ["L1", "L2"] },
    { id: "2", name: "Winter", locationIds: ["L2"] },
    { id: "3", name: "No locations" }
  ];
  assert.deepEqual(ld.growsUsing(grows, "L1").map((g) => g.name), ["Summer"]);
  assert.deepEqual(ld.growsUsing(grows, "L2").map((g) => g.name).sort(), ["Summer", "Winter"]);
});

test("assignmentHistory sorts chronologically and splits active/past", async () => {
  const { window } = await setup();
  const ld = window.LeafGuru.locationDomain;
  const eq = { locationAssignments: [
    { locationId: "L2", from: "2026-03-01T00:00:00Z", to: null },
    { locationId: "L1", from: "2026-01-01T00:00:00Z", to: "2026-03-01T00:00:00Z" }
  ] };
  const all = ld.assignmentHistory(eq);
  assert.deepEqual(all.map((a) => a.locationId), ["L1", "L2"]);
  const active = ld.assignmentHistory(eq, { past: false });
  assert.deepEqual(active.map((a) => a.locationId), ["L2"]);
  const past = ld.assignmentHistory(eq, { active: false });
  assert.deepEqual(past.map((a) => a.locationId), ["L1"]);
});

test("equipmentAt via adapter records (schema-valid)", async () => {
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const ld = window.LeafGuru.locationDomain;
  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  await storage.put("equipment", {
    name: "LED", category: "light", status: "in-use",
    locationAssignments: [{ locationId: loc.id, from: new Date().toISOString(), to: null }]
  });
  await storage.put("equipment", { name: "Spare", category: "other", status: "stored" });
  const equipment = await storage.list("equipment");
  assert.equal(ld.equipmentAt(equipment, loc.id).length, 1);
  assert.equal(ld.equipmentAt(equipment, "00000000-0000-4000-8000-000000000000").length, 0);
});