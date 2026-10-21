/**
 * LeafGuru — Dashboard: stats overview, grows overview, plants by stage,
 * due/overdue tasks.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const td = window.LeafGuru.taskDomain;
    const STAGE_ORDER = ["planned", "germinating", "seedling", "vegetative", "flowering", "harvest", "drying", "fermented", "cured"];

    const [grows, plants, tasks, locations] = await Promise.all([
      window.LeafGuru.storage.list("grows"),
      window.LeafGuru.storage.list("plants"),
      window.LeafGuru.storage.list("tasks"),
      window.LeafGuru.storage.list("locations")
    ]);

    const today = td.today();
    const openTasks = tasks.filter((k) => k.status === "open");
    const overdue = openTasks.filter((k) => td.isOverdue(k, today));
    const dueToday = openTasks.filter((k) => td.isDueToday(k, today));

    // --- stats overview ---
    const stats = [
      ["dashboard.activeGrows", grows.filter((g) => g.status === "active").length],
      ["dashboard.activeLocations", locations.filter((l) => l.active).length],
      ["dashboard.growingPlants", plants.filter((p) => p.status === "growing").length],
      ["dashboard.openTasks", openTasks.length],
      ["dashboard.overdueTasks", overdue.length],
      ["dashboard.dueTodayTasks", dueToday.length]
    ];
    const statsUl = document.querySelector("[data-stats-list]");
    for (const [key, value] of stats) {
      const li = document.createElement("li");
      const num = document.createElement("strong");
      num.textContent = String(value);
      if (key === "dashboard.overdueTasks" && value > 0) num.style.color = "var(--danger)";
      const label = document.createElement("span");
      label.className = "muted";
      label.textContent = t(key);
      li.append(num, label);
      statsUl.append(li);
    }

    // --- grows overview ---
    const growEl = document.querySelector("[data-page-section='grows-overview']");
    const activeGrows = grows.filter((g) => g.status === "active" || g.status === "planned");
    growEl.querySelector("[data-grow-empty]").hidden = grows.length > 0;
    const ulGrow = growEl.querySelector("[data-grow-list]");
    ulGrow.hidden = grows.length === 0;
    for (const grow of activeGrows) {
      const li = document.createElement("li");
      const nPlants = plants.filter((p) => p.growId === grow.id && p.status === "growing").length;
      const nLocs = (grow.locationIds ?? []).length;
      const nTasks = openTasks.filter((k) => k.growId === grow.id && td.isOverdue(k, today)).length;
      li.textContent = `${grow.name} (${t("grow.status." + grow.status)}) — ` +
        `${nPlants} ${t("nav.plants")} · ${nLocs} ${t("nav.locations")}` +
        (nTasks ? ` · ${nTasks} ⚠` : "");
      ulGrow.append(li);
    }

    // --- plants by stage (growing + planned) ---
    const byStage = {};
    for (const plant of plants.filter((p) => p.status === "growing")) {
      (byStage[plant.stage] ??= []).push(plant);
    }
    const stageEl = document.querySelector("[data-page-section='plants-by-stage']");
    stageEl.querySelector("[data-empty]").hidden = plants.length > 0;
    const ulStage = stageEl.querySelector("[data-stage-list]");
    ulStage.hidden = plants.length === 0;
    for (const stage of STAGE_ORDER.filter((s) => byStage[s]?.length)) {
      const li = document.createElement("li");
      li.textContent = `${t("stages." + stage)}: ${byStage[stage].length}` +
        ` (${byStage[stage].map((p) => p.name).join(", ")})`;
      ulStage.append(li);
    }
    const summary = stageEl.querySelector("[data-stage-summary]");
    if (plants.length > 0) {
      summary.hidden = false;
      summary.textContent =
        `${t("dashboard.activeLocations")}: ${locations.filter((l) => l.active).length}` +
        ` · ${t("dashboard.totalPlants")}: ${plants.length}`;
    }

    // --- due tasks (overdue first, via task domain) ---
    const due = td.dueList(tasks, { today });
    const taskEl = document.querySelector("[data-page-section='due-tasks']");
    taskEl.querySelector("[data-empty]").hidden = due.length > 0;
    const ulTasks = taskEl.querySelector("[data-task-list]");
    ulTasks.hidden = due.length === 0;
    for (const task of due.slice(0, 10)) {
      const li = document.createElement("li");
      const overdueFlag = td.isOverdue(task, today);
      li.textContent = `${task.title} — ${t("task.due")}: ${window.LeafGuru.format.date(task.dueDate ?? null)}` +
        (overdueFlag ? " ⚠ " + t("dashboard.overdue") : "");
      if (overdueFlag) li.style.color = "var(--danger)";
      ulTasks.append(li);
    }
  });
})();