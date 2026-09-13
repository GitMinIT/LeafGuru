/**
 * LeafGuru — Dashboard: plants by stage + due tasks, read from the adapter.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const stageList = document.querySelector("[data-stage-list]");
    const taskList = document.querySelector("[data-task-list]");
    const STAGE_ORDER = ["planned", "germinating", "seedling", "vegetative", "flowering", "harvest", "drying", "cured"];

    const [plants, tasks, locations] = await Promise.all([
      window.LeafGuru.storage.list("plants"),
      window.LeafGuru.storage.list("tasks"),
      window.LeafGuru.storage.list("locations")
    ]);

    // plants by stage
    const byStage = {};
    for (const plant of plants.filter((p) => p.status === "growing" || p.stage === "planned")) {
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

    // due tasks (open, sorted by dueDate, overdue flagged)
    const today = new Date().toISOString().slice(0, 10);
    const due = tasks.filter((task) => task.status === "open" && task.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const taskEl = document.querySelector("[data-page-section='due-tasks']");
    taskEl.querySelector("[data-empty]").hidden = due.length > 0;
    taskEl.querySelector("[data-empty]").textContent = t("messages.noTasks");
    const ulTasks = taskEl.querySelector("[data-task-list]");
    ulTasks.hidden = due.length === 0;
    for (const task of due) {
      const li = document.createElement("li");
      const overdue = task.dueDate < today;
      li.textContent = `${task.title} — ${t("task.due")}: ${task.dueDate}${overdue ? " ⚠ " + t("dashboard.overdue") : ""}`;
      if (overdue) li.style.color = "var(--danger)";
      ulTasks.append(li);
    }
    if (!due.length) taskEl.querySelector("[data-empty]").textContent = t("dashboard.noTasks");

    // active locations
    const locEl = document.querySelector("[data-page-section='plants-by-stage']");
    const count = locations.filter((l) => l.active).length;
    const summary = document.createElement("p");
    summary.className = "muted";
    summary.textContent = `${t("dashboard.activeLocations")}: ${count}`;
    locEl.append(summary);
  });
})();