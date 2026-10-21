/**
 * LeafGuru — timeline domain logic (calendar visualization).
 * Pure functions: month matrix + event collection from grow/plant/stage
 * log/task records. Tested in tests/timeline-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * Calendar matrix for one month: weeks start on Monday.
   * Returns { year, month, weeks: [[{ date: "YYYY-MM-DD", inMonth, isToday }]] }
   * — leading/trailing cells from adjacent months are included with
   * inMonth=false so the grid is complete. isToday needs `today`
   * ("YYYY-MM-DD") to be testable.
   */
  function monthMatrix(year, month, today = null) {
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const first = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // weekday: Mon=0 … Sun=6
    const lead = (first.getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = lead - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(year, month, -i));
      cells.push({ date: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: false, isToday: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = iso(year, month, day);
      cells.push({ date, inMonth: true, isToday: today === date });
    }
    let next = 1;
    while (cells.length % 7 !== 0) {
      const d = new Date(Date.UTC(year, month + 1, next++));
      cells.push({ date: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), inMonth: false, isToday: false });
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { year, month, weeks };
  }

  /** events on a given date (YYYY-MM-DD), sorted: stages → harvest → grow dates → tasks.
   *  Each event carries its full record + kind for the shared event popup. */
  function eventsForDate(date, { grows = [], plants = [], stageLogs = [], tasks = [], logEntries = [] }) {
    const plantById = new Map((plants ?? []).map((p) => [p.id, p]));
    const events = [];
    for (const log of stageLogs ?? []) {
      if ((log.enteredAt ?? "").slice(0, 10) !== date) continue;
      const plant = plantById.get(log.plantId);
      events.push({ kind: "stage", stage: log.stage, plantId: log.plantId, plantName: plant?.name ?? "–",
        at: date, record: log, plant });
    }
    for (const plant of plants ?? []) {
      if ((plant.harvestedAt ?? "") === date) {
        events.push({ kind: "harvest", plantId: plant.id, plantName: plant.name,
          yieldG: plant.harvestYieldG, at: date, record: plant, plant });
      }
    }
    for (const grow of grows ?? []) {
      for (const [key, kind] of [["startDate", "growStart"], ["endDate", "growEnd"]]) {
        if ((grow[key] ?? "") === date) {
          events.push({ kind, growId: grow.id, growName: grow.name, at: date, record: grow });
        }
      }
    }
    for (const task of tasks ?? []) {
      if (task.dueDate !== date || task.status !== "open") continue;
      const plant = task.plantId ? plantById.get(task.plantId) : null;
      events.push({ kind: "taskPlanned", taskId: task.id, title: task.title,
        plantName: plant?.name ?? null, at: date, record: task, plant });
    }
    for (const entry of logEntries ?? []) {
      if ((entry.at ?? "").slice(0, 10) !== date) continue;
      const entryPlants = (entry.plantIds ?? []).map((id) => plantById.get(id)).filter(Boolean);
      const cats = window.LeafGuru.logDomain?.categoriesOf?.(entry) ?? [];
      events.push({ kind: "log", title: entry.text, categories: cats,
        plantName: entryPlants.map((p) => p.name).join(", ") || null,
        at: date, record: entry, plants: entryPlants });
    }
    return events;
  }

  window.LeafGuru.timelineDomain = { monthMatrix, eventsForDate };
})();