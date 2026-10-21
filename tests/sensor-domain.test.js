/** Unit tests: sensor domain (bands, deviations, readings). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("rangeFor uses the stage band when a stage is given", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  // a seedling wants more humidity than a flowering plant
  // spread: a sandbox array has a different Array prototype, so
  // deepEqual would compare the structure but fail on the prototype
  assert.deepEqual([...sd.rangeFor("humidity", "seedling")], [60, 80]);
  assert.deepEqual([...sd.rangeFor("humidity", "flowering")], [40, 60]);
  // no stage -> the general band
  assert.deepEqual([...sd.rangeFor("humidity")], [45, 70]);
});

test("rangeFor returns null for a metric with no opinion", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  assert.equal(sd.rangeFor("other"), null);
  assert.equal(sd.rangeFor("nonsense"), null);
});

test("inRange: inside, below, above, and no-opinion", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  assert.equal(sd.inRange(24, [18, 26]), true);
  assert.equal(sd.inRange(18, [18, 26]), true);
  assert.equal(sd.inRange(26, [18, 26]), true);
  assert.equal(sd.inRange(10, [18, 26]), false);
  assert.equal(sd.inRange(30, [18, 26]), false);
  assert.equal(sd.inRange(30, null), null);
});

test("deviation measures how far outside the band a value sits", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  assert.equal(sd.deviation(22, [18, 26]), 0);        // inside
  assert.equal(sd.deviation(18, [18, 26]), 0);        // on the edge
  assert.equal(sd.deviation(14, [18, 26]), 0.5);      // half a band below
  assert.equal(sd.deviation(30, [18, 26]), 0.5);      // half a band above
  assert.equal(sd.deviation(30, null), null);
});

test("latestByMetric picks the newest reading per metric", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  const readings = [
    { metric: "temperature", value: 20, recordedAt: "2026-09-10T10:00:00Z" },
    { metric: "temperature", value: 24, recordedAt: "2026-09-11T10:00:00Z" },
    { metric: "humidity", value: 55, recordedAt: "2026-09-09T10:00:00Z" }
  ];
  const latest = sd.latestByMetric(readings);
  assert.equal(latest.temperature.value, 24);
  assert.equal(latest.humidity.value, 55);
});

test("series sorts one metric oldest first, latest reads the newest", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  const readings = [
    { metric: "temperature", value: 24, recordedAt: "2026-09-11T10:00:00Z" },
    { metric: "temperature", value: 20, recordedAt: "2026-09-10T10:00:00Z" },
    { metric: "humidity", value: 55, recordedAt: "2026-09-12T10:00:00Z" }
  ];
  const series = sd.series(readings, "temperature");
  assert.equal(series.length, 2);
  assert.equal(series[0].value, 20);
  assert.equal(sd.latest(readings, "temperature").value, 24);
  assert.equal(sd.latest(readings, "humidity").value, 55);
  assert.equal(sd.latest(readings, "co2"), null);
});

test("ageHours counts whole hours since a reading", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  const now = "2026-09-13T12:00:00Z";
  assert.equal(sd.ageHours({ recordedAt: "2026-09-13T10:00:00Z" }, now), 2);
  assert.equal(sd.ageHours({ recordedAt: "2026-09-13T11:30:00Z" }, now), 0);
  assert.equal(sd.ageHours(null, now), null);
});

test("format renders a value with its unit at the metric's precision", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  assert.equal(sd.format(24.37, "temperature"), "24.4 °C");
  assert.equal(sd.format(55.4, "humidity"), "55 %");
  assert.equal(sd.format(1.234, "ec"), "1.23 mS/cm");
  assert.equal(sd.format(6.2, "ph"), "6.2");
  assert.equal(sd.format(null, "temperature"), "–");
});

test("buildReading makes a valid record with the metric's unit", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  const reading = sd.buildReading({
    metric: "temperature", value: "22.5",
    growId: "grow-1", locationId: null, plantId: null
  });
  assert.equal(reading.metric, "temperature");
  assert.equal(reading.value, 22.5);
  assert.equal(reading.unit, "°C");
  assert.equal(reading.growId, "grow-1");
  assert.equal(reading.source, "manual");
  assert.ok(reading.id);
  assert.ok(reading.recordedAt);
});

test("buildReading rejects an unknown metric and a non-numeric value", async () => {
  const { window } = await setup();
  const sd = window.LeafGuru.sensorDomain;
  assert.throws(() => sd.buildReading({ metric: "nope", value: 1 }), /unknown metric/);
  assert.throws(() => sd.buildReading({ metric: "temperature", value: "abc" }), /numeric value/);
});
