/**
 * LeafGuru — sensor domain.
 *
 * Readings are the landing place for the optional hardware. This module
 * keeps the *interpretation* of a reading in one place, so the hints
 * engine, the charts and the hardware API all agree on what a number
 * means.
 *
 * Pure functions — no DOM, no storage. Tested in tests/sensor-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * The metrics we know how to speak about. `unit` is what we expect,
   * `range` is the comfortable band for a healthy plant, `stage` narrows
   * that band per growth stage (a seedling wants more humidity than a
   * flowering plant does).
   */
  const METRICS = {
    temperature: {
      label: "Temperature",
      unit: "°C",
      range: [18, 26],
      stageRange: { seedling: [20, 26], vegetative: [19, 27], flowering: [18, 25] },
      decimals: 1
    },
    humidity: {
      label: "Humidity",
      unit: "%",
      range: [45, 70],
      stageRange: { seedling: [60, 80], vegetative: [50, 70], flowering: [40, 60] },
      decimals: 0
    },
    ph: { label: "pH", unit: "", range: [5.5, 6.8], decimals: 1 },
    ec: { label: "EC", unit: "mS/cm", range: [0.8, 2.2], decimals: 2 },
    light: { label: "Light", unit: "PPFD", range: [200, 800], decimals: 0 },
    soilMoisture: { label: "Soil moisture", unit: "%", range: [35, 70], decimals: 0 },
    co2: { label: "CO2", unit: "PPM", range: [400, 1200], decimals: 0 },
    vpd: { label: "VPD", unit: "kPa", range: [0.6, 1.4], decimals: 2 },
    waterLevel: { label: "Water level", unit: "%", range: [20, 90], decimals: 0 },
    nutrientLevel: { label: "Nutrient level", unit: "%", range: [20, 90], decimals: 0 },
    other: { label: "Other", unit: "", range: null, decimals: 2 }
  };

  /** the metrics the app can store readings for, in a friendly order */
  const METRIC_KEYS = Object.keys(METRICS).filter((k) => k !== "other");

  /**
   * The comfortable band for a metric at a growth stage. Falls back to
   * the general range, and to null when we have no opinion (a metric
   * without a range — we never nag about a number we cannot judge).
   */
  function rangeFor(metric, stage = null) {
    const spec = METRICS[metric];
    if (!spec) return null;
    if (stage && spec.stageRange?.[stage]) return spec.stageRange[stage];
    return spec.range ?? null;
  }

  /** is a value inside a band? (null band -> we have no opinion) */
  function inRange(value, range) {
    if (!range || value == null) return null;
    return value >= range[0] && value <= range[1];
  }

  /**
   * How far outside the band a value sits, as a ratio of the band width.
   * 0 = exactly on the edge, 0.5 = half a band outside. Used to tell a
   * gentle nudge from a real problem.
   */
  function deviation(value, range) {
    if (!range || value == null) return null;
    const [lo, hi] = range;
    const width = hi - lo;
    if (width <= 0) return null;
    if (value < lo) return (lo - value) / width;
    if (value > hi) return (value - hi) / width;
    return 0;
  }

  /** the latest reading per metric, from an unsorted list */
  function latestByMetric(readings) {
    const out = {};
    for (const r of readings ?? []) {
      if (!r?.metric) continue;
      const current = out[r.metric];
      if (!current || (r.recordedAt ?? "") > (current.recordedAt ?? "")) out[r.metric] = r;
    }
    return out;
  }

  /** readings of one metric, oldest first */
  function series(readings, metric) {
    return (readings ?? [])
      .filter((r) => r.metric === metric)
      .sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
  }

  /** the newest reading of one metric, or null */
  function latest(readings, metric) {
    return series(readings, metric).at(-1) ?? null;
  }

  /** how long ago a reading was taken, in whole hours (null if no reading) */
  function ageHours(reading, now = null) {
    if (!reading?.recordedAt) return null;
    const then = new Date(reading.recordedAt).getTime();
    if (Number.isNaN(then)) return null;
    const ref = now ? new Date(now).getTime() : Date.now();
    return Math.max(0, Math.floor((ref - then) / 3600000));
  }

  /** format a value with its unit, at the metric's natural precision */
  function format(value, metric) {
    if (value == null) return "–";
    const spec = METRICS[metric] ?? METRICS.other;
    const decimals = spec.decimals ?? 1;
    const num = Number(value).toFixed(decimals);
    return spec.unit ? `${num} ${spec.unit}` : num;
  }

  /**
   * Build a reading record. The caller persists it — this is a pure
   * builder, like the other domain modules.
   */
  function buildReading({
    metric, value, unit = null, recordedAt = null,
    growId = null, locationId = null, plantId = null,
    deviceId = null, source = "manual", note = null
  }) {
    if (!metric || !METRICS[metric]) throw new Error(`unknown metric: ${metric}`);
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error("a reading needs a numeric value");
    const now = new Date().toISOString();
    return {
      id: window.LeafGuru.uuid(),
      growId: growId ?? null,
      locationId: locationId ?? null,
      plantId: plantId ?? null,
      deviceId: deviceId ?? null,
      metric,
      value: num,
      unit: unit ?? METRICS[metric].unit ?? null,
      recordedAt: recordedAt ?? now,
      source,
      note: note ?? null,
      createdAt: now,
      updatedAt: now
    };
  }

  window.LeafGuru.sensorDomain = {
    METRICS,
    METRIC_KEYS,
    rangeFor,
    inRange,
    deviation,
    latestByMetric,
    series,
    latest,
    ageHours,
    format,
    buildReading
  };
})();
