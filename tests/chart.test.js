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

test("multiLineChart: one polyline per series, distinct colors + legend", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const series = [
    { name: "Alpha", points: [
      { x: "2026-09-01T00:00:00Z", y: 5 }, { x: "2026-09-08T00:00:00Z", y: 12 }, { x: "2026-09-15T00:00:00Z", y: 24 }] },
    { name: "Beta", points: [
      { x: "2026-09-02T00:00:00Z", y: 4 }, { x: "2026-09-09T00:00:00Z", y: 10 }] }
  ];
  const { svg, legend } = chart.multiLineChart(series, { yLabel: "cm" });
  const polys = svg.children.filter((c) => c.tag === "polyline");
  assert.equal(polys.length, 2, "one polyline per series");
  assert.equal(polys[0].attrs.stroke, chart.PALETTE[0]);
  assert.equal(polys[1].attrs.stroke, chart.PALETTE[1]);
  assert.equal(svg.children.filter((c) => c.tag === "circle").length, 5, "dots for every point");
  assert.equal(legend.children.length, 2, "legend entry per series");
  assert.match(legend.children[0].children[0].attrs.style, new RegExp(chart.PALETTE[0]));
  assert.ok(String(legend.children[1].textContent).includes("Beta"));
  // tooltips carry the series name
  const dot = svg.children.find((c) => c.tag === "circle");
  assert.match(dot.children[0].textContent, /Alpha/);
});

test("multiLineChart: expected-height overlay line + label, shared axis", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const series = [
    { name: "Alpha", points: [
      { x: "2026-09-01T00:00:00Z", y: 5 }, { x: "2026-09-15T00:00:00Z", y: 24 }] }
  ];
  const { svg } = chart.multiLineChart(series, {
    yLabel: "cm",
    hLines: [{ y: 110, label: "expected 110 cm" }]
  });
  const hline = svg.children.filter((c) => c.tag === "line" && c.attrs.class === "chart-hline");
  assert.equal(hline.length, 1, "reference line present");
  assert.equal(hline[0].attrs["stroke-dasharray"], "5 5", "dashed");
  const label = svg.children.filter((c) => c.tag === "text" && c.attrs.class === "chart-hline-label");
  assert.equal(label.length, 1);
  assert.match(label[0].textContent, /expected 110 cm/);
  // overlay is included in the y-scale: no NaN, hline inside viewBox
  const [x, y] = hline[0].attrs.y1 === hline[0].attrs.y2 ? [hline[0].attrs.x1, hline[0].attrs.y1] : [0, 0];
  assert.ok(Number(y) >= 0 && Number(y) <= 240, `overlay y=${y} in range`);
});

test("multiLineChart: empty/single-point input renders placeholder", async () => {
  const { window } = await setup();
  const chart = window.LeafGuru.chart;
  const { svg } = chart.multiLineChart([]);
  assert.ok(svg.children.find((c) => c.tag === "text"));
  const single = chart.multiLineChart([{ name: "A", points: [{ x: "2026-09-01T00:00:00Z", y: 5 }] }]);
  assert.equal(single.svg.children.filter((c) => c.tag === "polyline").length, 0);
  // series with zero points are skipped, others still render
  const mixed = chart.multiLineChart([
    { name: "empty", points: [] },
    { name: "B", points: [{ x: "2026-09-01T00:00:00Z", y: 1 }, { x: "2026-09-02T00:00:00Z", y: 2 }] }
  ]);
  assert.equal(mixed.svg.children.filter((c) => c.tag === "polyline").length, 1);
  assert.equal(mixed.legend.children.length, 1);
});