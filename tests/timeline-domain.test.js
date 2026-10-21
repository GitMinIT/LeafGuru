/** Unit tests: timeline domain — month matrix + event collection. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("monthMatrix: October 2026 starts on a Thursday (Mon-first grid)", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const { year, month, weeks } = tl.monthMatrix(2026, 9, "2026-10-14");
  assert.equal(year, 2026);
  assert.equal(month, 9);
  // first week starts Mon 2026-09-28, Oct 1 lands at index 3 (Thu)
  assert.equal(weeks[0][0].date, "2026-09-28");
  assert.equal(weeks[0][3].date, "2026-10-01");
  for (let i = 0; i < 7; i++) assert.equal(weeks[0][i].inMonth, i >= 3);
  // grid is complete weeks only
  for (const week of weeks) assert.equal(week.length, 7);
  const totalInMonth = weeks.flat().filter((c) => c.inMonth).length;
  assert.equal(totalInMonth, 31, "October has 31 days");
});

test("monthMatrix: February 2026 (28 days, exact weeks) and today marker", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const { weeks } = tl.monthMatrix(2026, 1, "2026-02-10");
  const cells = weeks.flat();
  assert.equal(cells.filter((c) => c.inMonth).length, 28);
  // 2026-02-01 is a Sunday → first week has 6 leading days from January
  assert.equal(cells[0].date, "2026-01-26");
  assert.equal(cells[6].date, "2026-02-01");
  const today = cells.find((c) => c.isToday);
  assert.equal(today.date, "2026-02-10");
  assert.equal(cells.filter((c) => c.isToday).length, 1, "exactly one today");
});

test("monthMatrix: no today marker when today is outside the grid month", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const { weeks } = tl.monthMatrix(2026, 0, "2026-06-15");
  assert.equal(weeks.flat().filter((c) => c.isToday).length, 0);
});

test("monthMatrix: 31-day month ends with trailing days from next month", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const { weeks } = tl.monthMatrix(2026, 11, null); // December 2026
  const cells = weeks.flat();
  assert.equal(cells.at(-1).date, "2027-01-03");
  assert.equal(cells.at(-1).inMonth, false);
});

test("eventsForDate: log entries show on their day with plant names", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const plants = [{ id: "p1", name: "Alpha" }];
  const logEntries = [
    { id: "le1", at: "2026-09-14T18:30:00Z", categories: ["watering", "observation"],
      text: "watered 2L pH 6.3", plantIds: ["p1"] },
    { id: "le2", at: "2026-09-15T18:30:00Z", categories: ["note"], text: "next day" }
  ];
  const events = tl.eventsForDate("2026-09-14", { plants, logEntries });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "log");
  assert.deepEqual([...events[0].categories], ["watering", "observation"]);
  assert.equal(events[0].plantName, "Alpha");
  assert.equal(events[0].record.id, "le1");
  assert.equal(tl.eventsForDate("2026-09-14", { plants, logEntries: [] }).length, 0);
});

test("eventsForDate: stage entries, harvest, grow dates, open tasks — sorted per kind", async () => {
  const { window } = await setup();
  const tl = window.LeafGuru.timelineDomain;
  const plants = [
    { id: "p1", name: "Alpha", harvestYieldG: 42.5, harvestedAt: "2026-09-14" },
    { id: "p2", name: "Beta" }
  ];
  const grows = [
    { id: "g1", name: "Summer", startDate: "2026-09-14", endDate: null },
    { id: "g2", name: "Autumn", startDate: "2026-08-25", endDate: "2026-09-14" }
  ];
  const stageLogs = [
    { plantId: "p2", stage: "flowering", enteredAt: "2026-09-14T08:00:00.000Z" }
  ];
  const tasks = [
    { title: "Water Alpha", dueDate: "2026-09-14", status: "open", plantId: "p1" },
    { title: "Done task", dueDate: "2026-09-14", status: "done" }  // not open → hidden
  ];
  const events = tl.eventsForDate("2026-09-14", { grows, plants, stageLogs, tasks });
  assert.deepEqual([...events.map((e) => e.kind)], ["stage", "harvest", "growStart", "growEnd", "taskPlanned"]);
  assert.equal(events[0].plantName, "Beta");
  assert.equal(events[1].yieldG, 42.5);
  assert.equal(events[2].growName, "Summer");
  assert.equal(events[4].title, "Water Alpha");
  assert.equal(events[4].plantName, "Alpha");
  // full records are attached for the event popup
  assert.equal(events[0].record.stage, "flowering");
  assert.equal(events[3].record.endDate, "2026-09-14");
  // nothing on an empty date
  assert.equal(tl.eventsForDate("2026-09-15", { grows, plants, stageLogs, tasks }).length, 0);
});