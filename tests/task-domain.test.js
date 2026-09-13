/** Unit tests: task domain logic (status transitions, overdue, due list). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const task = (over = {}) => ({
  id: "6b2f0c1a-1111-4e5f-9a8b-3c2b1a0f9e8d",
  title: "Water",
  status: "open",
  priority: "medium",
  dueDate: null,
  completedAt: null,
  ...over
});

test("applyStatusChange open→done stamps completedAt", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const next = td.applyStatusChange({ task: task(), newStatus: "done", at: "2026-09-13T10:00:00Z" });
  assert.equal(next.status, "done");
  assert.equal(next.completedAt, "2026-09-13T10:00:00Z");
});

test("applyStatusChange keeps completedAt when re-marking done", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const done = { ...task(), status: "done", completedAt: "2026-09-12T10:00:00Z" };
  const next = td.applyStatusChange({ task: done, newStatus: "done", at: "2026-09-13T10:00:00Z" });
  assert.equal(next.completedAt, "2026-09-12T10:00:00Z");
});

test("applyStatusChange done→open clears completedAt", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const done = { ...task(), status: "done", completedAt: "2026-09-12T10:00:00Z" };
  const next = td.applyStatusChange({ task: done, newStatus: "open", at: "2026-09-13T10:00:00Z" });
  assert.equal(next.status, "open");
  assert.equal(next.completedAt, null);
});

test("applyStatusChange open→skipped stamps, skipped→open clears", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const skipped = td.applyStatusChange({ task: task(), newStatus: "skipped", at: "2026-09-13T10:00:00Z" });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.completedAt, "2026-09-13T10:00:00Z");
  const reopened = td.applyStatusChange({ task: skipped, newStatus: "open", at: "2026-09-14T10:00:00Z" });
  assert.equal(reopened.completedAt, null);
});

test("applyStatusChange rejects unknown status", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  assert.throws(() => td.applyStatusChange({ task: task(), newStatus: "wibbly" }), /unknown task status/);
});

test("isOverdue only for open tasks with past dueDate", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const today = "2026-09-13";
  assert.equal(td.isOverdue({ ...task(), dueDate: "2026-09-12" }, today), true);
  assert.equal(td.isOverdue({ ...task(), dueDate: "2026-09-13" }, today), false);
  assert.equal(td.isOverdue({ ...task(), dueDate: "2026-09-14" }, today), false);
  assert.equal(td.isOverdue({ ...task(), dueDate: "2026-09-12", status: "done" }, today), false);
  assert.equal(td.isOverdue({ ...task(), dueDate: null }, today), false);
});

test("isDueToday matches only today's date", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const today = "2026-09-13";
  assert.equal(td.isDueToday({ ...task(), dueDate: "2026-09-13" }, today), true);
  assert.equal(td.isDueToday({ ...task(), dueDate: "2026-09-12" }, today), false);
  assert.equal(td.isDueToday({ ...task(), dueDate: "2026-09-13", status: "done" }, today), false);
});

test("dueList: overdue first, then by date; closed tasks excluded", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const today = "2026-09-13";
  const tasks = [
    task({ id: "a", title: "future", dueDate: "2026-09-20" }),
    task({ id: "b", title: "today", dueDate: "2026-09-13" }),
    task({ id: "c", title: "overdue", dueDate: "2026-09-10" }),
    task({ id: "d", title: "no-date" }),
    task({ id: "e", title: "closed", dueDate: "2026-09-01", status: "done" })
  ];
  const list = td.dueList(tasks, { today });
  assert.deepEqual(list.map((x) => x.title), ["overdue", "today", "future", "no-date"]);
});

test("dueList with no dates still returns open tasks stable", async () => {
  const { window } = await setup();
  const td = window.LeafGuru.taskDomain;
  const list = td.dueList([task({ id: "x" }), task({ id: "y" })], { today: "2026-09-13" });
  assert.equal(list.length, 2);
});