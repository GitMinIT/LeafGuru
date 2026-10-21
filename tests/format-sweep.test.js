/** Regression: page-level date displays honor the saved date format. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");
const { bootPage } = require("./helpers/dom-stub");

test("tasks page: due/completed dates render in the configured format", async () => {
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  window: {
    // settings: German-style dates
    setupResult.window.LeafGuru.settings.set("dateFormat", "dmy");
    await storage.put("tasks", { title: "Water Alpha", status: "open", priority: "high", dueDate: "2026-09-14" });
    await storage.put("tasks", {
      title: "Done chore", status: "done", priority: "low",
      dueDate: "2026-09-01", completedAt: "2026-09-02T10:30:00Z"
    });
  }

  const { doc } = await bootPage(setupResult, "static/js/pages/tasks.js");
  // real browsers default the status filter select to "open"; the stub
  // starts empty — set it and re-render (same as the page-smoke test)
  const filterEl = doc._bySelector.get("#task-status-filter");
  filterEl.value = "all";
  filterEl.dispatch("change");
  await new Promise((r) => setImmediate(r));
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 2);
  const texts = listEl.children.map((row) => row.children.map((c) => c.textContent).join(" | ")).join("\n");
  assert.match(texts, /14\.09\.2026/, "due date in dmy format");
  assert.ok(!texts.includes("2026-09-14"), "no raw ISO dates in the list");
  // completedAt renders inside the actions cell as its own small element
  const doneRow = listEl.children[1];
  const doneSmall = doneRow.children.at(-1).children.at(-1);
  assert.equal(doneSmall.textContent, "02.09.2026", "completed date in dmy format");
});

test("grows page: start/end dates render in the configured format", async () => {
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  setupResult.window.LeafGuru.settings.set("dateFormat", "dmy");
  await storage.put("grows", {
    name: "Summer", status: "closed", startDate: "2026-05-04", endDate: "2026-07-28"
  });

  const { doc } = await bootPage(setupResult, "static/js/pages/grows.js");
  const listEl = doc._bySelector.get("[data-crud-list]");
  const dates = listEl.children[0].children[2].textContent;
  assert.equal(dates, "04.05.2026 → 28.07.2026", "range in dmy");
});

test("timeline: chart labels + history headers honor the format (unit-level)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const w = setupResult.window;
  w.LeafGuru.settings.set("dateFormat", "dmy");
  w.LeafGuru.settings.set("timezone", "UTC");
  const fmt = w.LeafGuru.format;
  // the exact calls the pages perform
  assert.equal(fmt.date("2026-09-14"), "14.09.2026");
  assert.equal(fmt.dateTime("2026-09-14T18:30:00Z"), "14.09.2026, 18:30");
  // ...and the chart tooltip path via its module-internal fmtDate
  const chart = w.LeafGuru.chart;
  const svg = chart.lineChart([{ x: "2026-09-14T00:00:00Z", y: 5 }, { x: "2026-09-20T00:00:00Z", y: 9 }]);
  const dots = svg.children.filter((c) => c.tag === "circle");
  assert.match(dots[0].children[0].textContent, /14\.09\.2026/, "chart tooltip formatted");
  assert.ok(!svg.children.some((c) => c.textContent?.includes?.("2026-09-1") === true && c.tag === "circle"));
});