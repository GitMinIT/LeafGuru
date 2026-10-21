/**
 * LeafGuru — history domain (per-grow event log).
 * Pure functions: collects every dated event of one grow into one
 * verbose, chronologically sorted list — the "history" the History page
 * and the event popup render. Tested in tests/history-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * All events of one grow, newest last. Sources:
   * - grow start/end
   * - stage log entries (entered/left) of the grow's plants
   * - harvest (yield) + germination per plant
   * - measurements, photos (phaseTag date), location changes
   * - tasks (dueDate open = planned, completedAt = done; skipped keeps updatedAt)
   * - equipment purchases (purchaseDate) + assignments (from)
   * - journal log entries (watering, feeding, … — the daily log)
   * Every event: { id, at, atEnd, kind, title, icon, fields: [label, value],
   *   record, plant?, location?, entity } — `at` is the sort anchor.
   */
  function eventsForGrow(grow, data) {
    if (!grow?.id) return [];
    const {
      plants = [], stageLogs = [], measurements = [], locationChanges = [],
      tasks = [], equipment = [], photos = [], locations = [], strainTemplates = [],
      logEntries = []
    } = data ?? {};

    const plantById = new Map(plants.map((p) => [p.id, p]));
    const locationById = new Map(locations.map((l) => [l.id, l]));
    const templateById = new Map(strainTemplates.map((t) => [t.id, t]));
    const growPlants = new Set(plants.filter((p) => p.growId === grow?.id).map((p) => p.id));
    const locIds = new Set(grow?.locationIds ?? []);
    const events = [];
    const day = (iso) => (iso ?? "").slice(0, 10);

    const push = (e) => {
      e.id ??= `${e.kind}-${e.at}-${events.length}`;
      events.push(e);
    };

    // --- grow itself ---
    if (grow?.startDate)
      push({ at: grow.startDate, kind: "growStart", title: grow.name, icon: "🌱", entity: "grows", record: grow,
        fields: [["common.date", grow.startDate]] });
    if (grow?.endDate)
      push({ at: grow.endDate, kind: "growEnd", title: grow.name, icon: "🏁", entity: "grows", record: grow,
        fields: [["common.date", grow.endDate]] });

    // --- per plant: germination, stages, harvest ---
    for (const plant of plants) {
      if (plant.growId !== grow?.id) continue;
      if (plant.germinationDate)
        push({ at: plant.germinationDate, kind: "germination", title: plant.name, icon: "🫘", entity: "plants", record: plant,
          plant, fields: [["plant.germinationDate", plant.germinationDate]] });
    }
    for (const log of stageLogs) {
      if (!growPlants.has(log.plantId)) continue;
      const plant = plantById.get(log.plantId);
      push({ at: day(log.enteredAt), atEnd: log.leftAt ? day(log.leftAt) : null,
        kind: "stage", title: log.stage, icon: "🌿", entity: "stageLogs", record: log, plant,
        fields: [] });
    }
    for (const plant of plants) {
      if (plant.growId !== grow?.id || !plant.harvestedAt) continue;
      push({ at: plant.harvestedAt, kind: "harvest", title: plant.name, icon: "✂️", entity: "plants", record: plant,
        plant,
        fields: [["plant.harvestYield", plant.harvestYieldG != null ? `${Math.round(plant.harvestYieldG)} g` : "–"]] });
    }

    // --- measurements ---
    for (const m of measurements) {
      if (!growPlants.has(m.plantId)) continue;
      push({ at: day(m.measuredAt), kind: "measurement", title: `${m.type}: ${m.value} ${m.unit}`, icon: "📏",
        entity: "measurements", record: m, plant: plantById.get(m.plantId),
        fields: [["plant.value", `${m.value} ${m.unit}`], ["common.notes", m.note ?? ""]] });
    }

    // --- location changes ---
    for (const c of locationChanges) {
      if (!growPlants.has(c.plantId)) continue;
      push({ at: day(c.changedAt), kind: "locationChange", icon: "🚚", title: "", entity: "locationChanges",
        record: c, plant: plantById.get(c.plantId),
        fields: [["plant.reason", c.reason ?? ""]] });
    }

    // --- photos (dated via takenAt; phaseTag context) ---
    for (const ph of photos) {
      if (!growPlants.has(ph.plantId)) continue;
      push({ at: day(ph.takenAt), kind: "photo", title: ph.note ?? "", icon: "📷", entity: "photos", record: ph,
        plant: plantById.get(ph.plantId),
        fields: [["plant.photoPhase", ph.phaseTag ?? ""], ["common.notes", ph.note ?? ""]] });
    }

    // --- log entries (journal) ---
    for (const entry of logEntries) {
      if (entry.growId !== grow?.id) continue;
      const entryPlants = (entry.plantIds ?? []).map((id) => plantById.get(id)).filter(Boolean);
      push({ at: day(entry.at), kind: "log", icon: "📝", title: entry.text, entity: "logEntries",
        record: entry, plant: entryPlants[0] ?? null,
        plants: entryPlants,
        fields: [] });
    }

    // --- tasks: planned (open+due), completed, skipped ---
    const growTasks = new Set(tasks.filter((t) => t.growId === grow?.id).map((t) => t.id));
    for (const task of tasks) {
      if (task.growId !== grow?.id) continue;
      if (task.dueDate && task.status === "open")
        push({ at: task.dueDate, kind: "taskPlanned", title: task.title, icon: "🗓", entity: "tasks", record: task,
          plant: task.plantId ? plantById.get(task.plantId) : null,
          fields: [["task.priority", `task.priority.${task.priority}`], ["plant.reason", task.description ?? ""]] });
      if (task.completedAt)
        push({ at: day(task.completedAt), kind: task.status === "skipped" ? "taskSkipped" : "taskDone",
          title: task.title, icon: task.status === "skipped" ? "⏭" : "✔", entity: "tasks", record: task,
          plant: task.plantId ? plantById.get(task.plantId) : null,
          fields: [["task.priority", `task.priority.${task.priority}`]] });
    }

    // --- equipment: purchase + assignment start (grow-linked + shared) ---
    for (const eq of equipment) {
      if (eq.growId !== grow?.id && !eq.availableEverywhere) continue;
      if (eq.purchaseDate)
        push({ at: eq.purchaseDate, kind: "equipmentPurchase", title: eq.name, icon: "🧾", entity: "equipment", record: eq,
          fields: [["equipment.cost", eq.cost != null ? `${eq.cost} ${eq.currency ?? ""}` : "–"],
            ["equipment.status", `equipment.status.${eq.status}`]] });
      for (const a of eq.locationAssignments ?? []) {
        if (!locIds.has(a.locationId) && !eq.availableEverywhere) continue;
        push({ at: day(a.from), atEnd: a.to ? day(a.to) : null, kind: "equipmentAssignment", title: eq.name, icon: "📦",
          entity: "equipment", record: eq,
          location: locationById.get(a.locationId),
          fields: [["location.title", locationById.get(a.locationId)?.name ?? "–"]] });
      }
    }

    // sort: by date (newest last), ties by collection order (stable)
    const ordered = events.map((e, i) => ({ ...e, _i: i }))
      .sort((a, b) => a.at.localeCompare(b.at) || a._i - b._i);
    for (const e of ordered) delete e._i;
    return ordered;
  }

  window.LeafGuru.historyDomain = { eventsForGrow };
})();