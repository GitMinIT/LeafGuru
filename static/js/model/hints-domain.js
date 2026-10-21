/**
 * LeafGuru — care hints.
 *
 * The engine that turns the app's own data into small, kind, actionable
 * nudges: "your plants haven't been watered in 3 days", "it is a bit
 * warm in the tent", "this plant has been in seedling for longer than
 * its strain usually takes".
 *
 * Design rules, so the tone stays wholesome:
 *  * A hint is never a scolding. The severity says how much attention
 *    it deserves, not how bad the grower is.
 *  * Every hint has a next step, or it is not worth showing.
 *  * Silence is fine. If everything is healthy, there is nothing to say.
 *  * Never invent a number the user did not record. If we do not know,
 *    we do not nag.
 *
 * Pure functions — no DOM, no storage. Tested in tests/hints-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /** how many days a plant can go without water before we mention it */
  const WATERING_DAYS = 3;
  /** how old a sensor reading may be before we stop trusting it */
  const READING_FRESH_HOURS = 6;

  const STAGE_ORDER = ["germinating", "seedling", "vegetative", "flowering"];

  /** the growth stage a grow is currently in (the most advanced plant) */
  function dominantStage(plants, growId) {
    const stages = (plants ?? [])
      .filter((p) => p.growId === growId && p.status === "growing")
      .map((p) => p.stage);
    let best = null;
    let bestIndex = -1;
    for (const stage of stages) {
      const index = STAGE_ORDER.indexOf(stage);
      if (index > bestIndex) { bestIndex = index; best = stage; }
    }
    return best;
  }

  /** the newest log entry of a category (optionally per grow) */
  function lastEntry(entries, category, growId = null) {
    let best = null;
    for (const entry of entries ?? []) {
      const cats = entry.categories?.length ? entry.categories : (entry.category ? [entry.category] : []);
      if (!cats.includes(category)) continue;
      if (growId && entry.growId !== growId) continue;
      if (!best || (entry.at ?? "") > (best.at ?? "")) best = entry;
    }
    return best;
  }

  /** whole days between two ISO timestamps */
  function daysBetween(fromIso, toIso) {
    if (!fromIso) return null;
    const from = new Date(fromIso).getTime();
    const to = new Date(toIso ?? Date.now()).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    return Math.floor((to - from) / 86400000);
  }

  /**
   * Compute the hints for the whole app.
   *
   * Returns an array of
   *   { id, kind, severity, title, detail, action: { label, href } }
   * sorted by severity (attention first) and then by kind.
   */
  function compute(state = {}, { now = null } = {}) {
    const {
      grows = [], plants = [], tasks = [], logEntries = [],
      sensorReadings = [], strainTemplates = [], stageLogs = []
    } = state;
    const nowIso = now ?? new Date().toISOString();
    const hints = [];

    const templatesById = new Map(strainTemplates.map((s) => [s.id, s]));
    const sensor = window.LeafGuru.sensorDomain;
    const plantDomain = window.LeafGuru.plantDomain;
    const taskDomain = window.LeafGuru.taskDomain;

    // --- 1. overdue tasks ---------------------------------------------
    const today = taskDomain.today(nowIso);
    for (const task of taskDomain.dueList(tasks, { today })) {
      if (!taskDomain.isOverdue(task, today)) continue;
      const days = daysBetween(task.dueDate, nowIso) ?? 0;
      hints.push({
        id: `task-overdue-${task.id}`,
        kind: "task",
        severity: "attention",
        title: task.title,
        detail: days === 0
          ? "This was due today and is still open."
          : `This was due ${days} day${days === 1 ? "" : "s"} ago and is still open.`,
        action: { label: "Open the task", href: "/tasks/" }
      });
    }

    // --- 2. watering cadence ------------------------------------------
    // The last watering across the app (or per grow, when the user
    // grows more than one thing).
    const activeGrows = grows.filter((g) => g.status === "active" || g.status === "planned");
    for (const grow of activeGrows) {
      const growPlants = plants.filter((p) => p.growId === grow.id && p.status === "growing");
      if (!growPlants.length) continue;
      const lastWater = lastEntry(logEntries, "watering", grow.id);
      const days = daysBetween(lastWater?.at, nowIso);
      // no watering record at all -> we do not nag (we do not know)
      if (days == null) continue;
      if (days < WATERING_DAYS) continue;
      hints.push({
        id: `water-${grow.id}`,
        kind: "watering",
        severity: days >= WATERING_DAYS + 2 ? "attention" : "gentle",
        title: `Watering time for ${grow.name}`,
        detail: lastWater
          ? `The last watering was ${days} day${days === 1 ? "" : "s"} ago.`
          : "Your plants have not been watered lately.",
        action: { label: "Log a watering", href: "/journal/" }
      });
    }

    // --- 3. plants past their expected stage duration ------------------
    for (const plant of plants.filter((p) => p.status === "growing")) {
      const template = plant.strainTemplateId ? templatesById.get(plant.strainTemplateId) : null;
      if (!template) continue;
      const progress = plantDomain.stageProgress({ plant, stageLogs, strainTemplate: template, now: nowIso });
      if (!progress || !progress.overdue) continue;
      const days = Math.abs(progress.remaining);
      hints.push({
        id: `stage-${plant.id}`,
        kind: "stage",
        severity: "gentle",
        title: `${plant.name} is taking its time`,
        detail: `It has been ${progress.day} days in ${plant.stage} — about ${days} day${days === 1 ? "" : "s"} longer than ${template.name ?? "this strain"} usually takes.`,
        action: { label: "Open the plant", href: "/plants/" }
      });
    }

    // --- 4. sensor readings outside the comfortable band ---------------
    const latest = sensor.latestByMetric(sensorReadings);
    for (const [metric, reading] of Object.entries(latest)) {
      const age = sensor.ageHours(reading, nowIso);
      if (age == null || age > READING_FRESH_HOURS) continue;   // too old to judge
      const grow = reading.growId ? grows.find((g) => g.id === reading.growId) : null;
      const stage = grow ? dominantStage(plants, grow.id) : null;
      const range = sensor.rangeFor(metric, stage);
      const inside = sensor.inRange(reading.value, range);
      if (inside !== false) continue;
      const off = sensor.deviation(reading.value, range) ?? 0;
      const high = reading.value > range[1];
      const where = grow ? ` in ${grow.name}` : "";
      hints.push({
        id: `sensor-${metric}-${reading.id}`,
        kind: "sensor",
        severity: off > 0.5 ? "attention" : "gentle",
        title: `${sensor.METRICS[metric]?.label ?? metric} is a bit ${high ? "high" : "low"}${where}`,
        detail: `The last reading was ${sensor.format(reading.value, metric)} — the comfortable band is ${range[0]}–${range[1]}${sensor.METRICS[metric]?.unit ? " " + sensor.METRICS[metric].unit : ""}.`,
        action: { label: "Open the sensors", href: "/sensors/" }
      });
    }

    // --- 5. a grow that has been running a long time ------------------
    for (const grow of grows.filter((g) => g.status === "active")) {
      if (!grow.startDate) continue;
      const days = daysBetween(grow.startDate, nowIso);
      if (days == null || days < 30) continue;
      const growPlants = plants.filter((p) => p.growId === grow.id && p.status === "growing");
      if (!growPlants.length) continue;
      hints.push({
        id: `grow-long-${grow.id}`,
        kind: "grow",
        severity: "info",
        title: `${grow.name} is ${days} days in`,
        detail: `${growPlants.length} plant${growPlants.length === 1 ? "" : "s"} still growing. A good moment to check the notes and tidy up the setup.`,
        action: { label: "Open the grow", href: "/grows/" }
      });
    }

    // --- 6. a plant with no journal entries at all --------------------
    const journalled = new Set();
    for (const entry of logEntries ?? []) {
      for (const id of entry.plantIds ?? []) journalled.add(id);
    }
    for (const plant of plants.filter((p) => p.status === "growing" && p.stage !== "planned")) {
      if (journalled.has(plant.id)) continue;
      const age = daysBetween(plant.createdAt, nowIso);
      if (age == null || age < 7) continue;
      hints.push({
        id: `quiet-${plant.id}`,
        kind: "journal",
        severity: "info",
        title: `${plant.name} has no journal yet`,
        detail: "A line every few days makes the whole grow easier to look back on.",
        action: { label: "Write the first line", href: "/journal/" }
      });
    }

    const rank = { attention: 0, gentle: 1, info: 2 };
    return hints.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3)
      || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }

  window.LeafGuru.hintsDomain = {
    WATERING_DAYS,
    READING_FRESH_HOURS,
    dominantStage,
    lastEntry,
    daysBetween,
    compute
  };
})();
