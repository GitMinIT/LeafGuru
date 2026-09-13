/**
 * LeafGuru — Tasks page controller.
 * List with status filter, overdue highlighting, inline done/skipped/reopen,
 * create/edit form with plant, location and stage-hint selectors.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const td = window.LeafGuru.taskDomain;
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    const STAGE_HINTS = ["germinating", "seedling", "vegetative", "flowering", "harvest", "drying", "cured"];

    const statusFilter = $("#task-status-filter");
    let cache = { tasks: [], plants: [], locations: [] };
    let flashTimer;

    function flash(msg, isError = false) {
      const el = $("[data-crud-flash]");
      el.textContent = msg;
      el.hidden = false;
      el.style.color = isError ? "var(--danger)" : "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
    }

    function formatErrors(e) {
      return `${t("messages.validationFailed")}: ` +
        e.errors.slice(0, 3).map((x) => `${x.path.replace(/^\$./, "")} ${x.message}`).join("; ");
    }

    const nameOf = (list, id) => list.find((x) => x.id === id)?.name ?? null;

    async function refresh() {
      const [tasks, plants, locations] = await Promise.all([
        storage.list("tasks"), storage.list("plants"), storage.list("locations")
      ]);
      cache = { tasks, plants, locations };
      renderList();
      fillSelectors();
    }

    function fillSelectors() {
      const plantSel = $("#task-plant");
      const locSel = $("#task-location");
      const plantCur = plantSel.value, locCur = locSel.value;
      plantSel.replaceChildren(new Option(t("common.none"), ""));
      for (const p of cache.plants.slice().sort((a, b) => a.name.localeCompare(b.name)))
        plantSel.append(new Option(p.name, p.id));
      locSel.replaceChildren(new Option(t("common.none"), ""));
      for (const l of cache.locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)))
        locSel.append(new Option(l.name, l.id));
      plantSel.value = plantCur; locSel.value = locCur;
    }

    function renderList() {
      const today = td.today();
      const filter = statusFilter.value;
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      let rows = cache.tasks;
      if (filter !== "all") rows = rows.filter((task) => task.status === filter);
      rows = rows.slice().sort((a, b) => {
        const ao = td.isOverdue(a, today) ? 0 : 1, bo = td.isOverdue(b, today) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (a.status !== b.status && (a.status === "open" || b.status === "open")) return a.status === "open" ? -1 : 1;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });

      $("[data-count-open]").textContent = cache.tasks.filter((task) => task.status === "open").length;
      $("[data-count-overdue]").textContent = cache.tasks.filter((task) => td.isOverdue(task, today)).length;

      listEl.replaceChildren();
      emptyEl.hidden = rows.length > 0;
      listEl.hidden = rows.length === 0;
      emptyEl.textContent = filter === "all" ? t("messages.noTasks") : t("task.emptyFilter");

      for (const task of rows) {
        const row = document.createElement("li");
        row.className = "crud-row task-row";
        if (task.status !== "open") row.classList.add("task-row--closed");
        if (td.isOverdue(task, today)) row.classList.add("task-row--overdue");

        const title = document.createElement("span");
        title.className = "crud-cell crud-cell--name";
        title.textContent = task.title;
        if (td.isOverdue(task, today)) title.title = t("task.overdue");

        const status = document.createElement("span");
        status.className = `crud-cell task-status task-status--${task.status}`;
        status.textContent = t("task." + task.status);

        const due = document.createElement("span");
        due.className = "crud-cell";
        if (task.dueDate) {
          due.textContent = task.dueDate;
          if (td.isDueToday(task, today)) due.textContent += ` · ${t("common.today")}`;
        } else {
          due.textContent = "–";
        }

        const link = document.createElement("span");
        link.className = "crud-cell";
        const plantName = nameOf(cache.plants, task.plantId);
        const locName = nameOf(cache.locations, task.locationId);
        link.textContent = [plantName, locName].filter(Boolean).join(" · ") || "–";

        const prio = document.createElement("span");
        prio.className = "crud-cell";
        prio.textContent = t("task.priority." + (task.priority ?? "medium"));

        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        if (task.status === "open") {
          actions.append(
            actionBtn(t("task.markDone"), async () => setStatus(task, "done")),
            actionBtn(t("task.markSkipped"), async () => setStatus(task, "skipped")),
            actionBtn(t("common.edit"), () => openForm(task))
          );
        } else {
          actions.append(
            actionBtn(t("task.reopen"), async () => setStatus(task, "open")),
            actionBtn(t("common.delete"), () => removeTask(task))
          );
          if (task.completedAt) {
            const done = document.createElement("small");
            done.className = "muted";
            done.textContent = task.completedAt.slice(0, 10);
            actions.append(done);
          }
        }
        row.append(title, status, due, link, prio, actions);
        listEl.append(row);
      }
    }

    function actionBtn(label, fn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    }

    async function setStatus(task, newStatus) {
      try {
        await storage.put("tasks", td.applyStatusChange({ task, newStatus }));
        flash(t("messages.saved"));
        await refresh();
      } catch (e) { flash(e.message, true); }
    }

    async function removeTask(task) {
      if (!window.confirm(t("messages.confirmDelete", { name: task.title }))) return;
      await storage.delete("tasks", task.id);
      flash(t("messages.deleted"));
      await refresh();
    }

    function openForm(record = null) {
      const dialog = $("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      form.dataset.editingId = record?.id ?? "";
      $("[data-crud-form-title]").textContent = record
        ? `${t("common.edit")}: ${record.title}`
        : t("task.createTitle");
      // defaults for create
      if (!record) {
        $("#task-priority").value = "medium";
        $("#task-status-hidden").value = "open";
      }
      $("#task-plant").value = record?.plantId ?? "";
      $("#task-location").value = record?.locationId ?? "";
      $("#task-stage-hint").value = record?.stageHint ?? "";
      form.elements["title"].value = record?.title ?? "";
      form.elements["description"].value = record?.description ?? "";
      form.elements["dueDate"].value = record?.dueDate ?? "";
      $("#task-priority").value = record?.priority ?? "medium";
      dialog.showModal();
    }

    async function submitForm(event) {
      event.preventDefault();
      const form = event.target;
      const editingId = form.dataset.editingId || null;
      const record = editingId ? await storage.get("tasks", editingId) : {};
      record.title = form.elements["title"].value.trim();
      record.description = form.elements["description"].value.trim();
      record.dueDate = form.elements["dueDate"].value || null;
      record.priority = $("#task-priority").value;
      record.plantId = $("#task-plant").value || null;
      record.locationId = $("#task-location").value || null;
      record.stageHint = $("#task-stage-hint").value || null;
      if (!editingId) record.status = "open";
      try {
        await storage.put("tasks", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        flash(e.name === "LeafGuruValidationError" ? formatErrors(e) : e.message, true);
      }
    }

    // wire DOM
    $("[data-crud-new]").addEventListener("click", () => openForm(null));
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    $("[data-crud-cancel]").addEventListener("click", () => $("[data-crud-dialog]").close());
    statusFilter.addEventListener("change", renderList);

    await refresh();
  });
})();