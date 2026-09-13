/** Unit tests: chart module — SVG builder + measurement series. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("lineChart with <2 points renders placeholder", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const empty = chart.lineChart([]);
  assert.equal(empty.tag, "svg");
  assert.equal(empty.attrs.viewBox, "0 0 560 220");
  const note = empty.children.find((c) => c.tag === "text");
  assert.equal(note.textContent, "–");
  const single = chart.lineChart([{ x: "2026-01-01T00:00:00Z", y: 5 }]);
  assert.equal(single.children.find((c) => c.tag === "text").textContent, "5");
});

test("lineChart builds grid, labels, polyline, dots in order", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const points = [
    { x: "2026-01-01T00:00:00Z", y: 4 },
    { x: "2026-01-08T00:00:00Z", y: 12 },
    { x: "2026-01-15T00:00:00Z", y: 30 }
  ];
  const svg = chart.lineChart(points, { yLabel: "cm" });
  // 5 gridlines + 5 y labels + 2 x labels + polyline + 3 dots
  assert.equal(svg.children.filter((c) => c.tag === "line").length, 5);
  assert.equal(svg.children.filter((c) => c.tag === "text").length, 7);
  const poly = svg.children.find((c) => c.tag === "polyline");
  assert.ok(poly, "polyline present");
  assert.equal(poly.attrs.points.split(" ").length, 3);
  assert.equal(svg.children.filter((c) => c.tag === "circle").length, 3);
  // y-axis labels sit at x = pad - 6; the top one carries the unit
  const yLabels = svg.children.filter((c) => c.tag === "text" && c.attrs.x === "28");
  assert.equal(yLabels.length, 5);
  assert.equal(yLabels.at(-1).textContent, "30 cm");
});

test("polyline points stay inside the viewBox", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const points = [
    { x: "2026-01-01T00:00:00Z", y: 0 },
    { x: "2026-06-01T00:00:00Z", y: 150 }
  ];
  const svg = chart.lineChart(points);
  const poly = svg.children.find((c) => c.tag === "polyline");
  for (const pair of poly.attrs.points.split(" ")) {
    const [x, y] = pair.split(",").map(Number);
    assert.ok(x >= 0 && x <= 560, `x=${x} in range`);
    assert.ok(y >= 0 && y <= 220, `y=${y} in range`);
  }
});

test("seriesFromMeasurements filters type and sorts chronologically", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const measurements = [
    { type: "height", value: 30, measuredAt: "2026-01-15T00:00:00Z" },
    { type: "weight", value: 2, measuredAt: "2026-01-16T00:00:00Z" },
    { type: "height", value: 4, measuredAt: "2026-01-01T00:00:00Z" },
    { type: "height", value: 12, measuredAt: "2026-01-08T00:00:00Z" }
  ];
  const series = chart.seriesFromMeasurements(measurements, "height");
  assert.deepEqual(series.map((p) => p.y), [4, 12, 30]);
  assert.deepEqual(series.map((p) => p.x.slice(0, 10)), ["2026-01-01", "2026-01-08", "2026-01-15"]);
});

test("flat series (all same value) does not divide by zero", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const svg = chart.lineChart([
    { x: "2026-01-01T00:00:00Z", y: 10 },
    { x: "2026-01-02T00:00:00Z", y: 10 }
  ]);
  const poly = svg.children.find((c) => c.tag === "polyline");
  assert.ok(!poly.attrs.points.includes("NaN"), "no NaN in points");
});