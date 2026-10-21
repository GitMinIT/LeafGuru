/**
 * LeafGuru — Tasks page controller.
 * List (status filter, overdue highlighting, inline done/skipped/reopen)
 * + Kanban board view toggle (open / done / skipped columns with
 * click-to-move). Create/edit form with plant, location and stage-hint
 * selectors.
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
    let cache = { tasks: [], plants: [], locations: [], grows: [] };
    let searchTerm = "";
    let flashTimer;
    let boardMode = false;

    function flash(msg, isError = false) {
      const el = $("[data-crud-flash]");
      el.textContent = msg;
      el.hidden = false;
      el.style.color = isError ? "var(--danger)" : "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
    }

    const nameOf = (list, id) => list.find((x) => x.id === id)?.name ?? null;

    async function refresh() {
      const [tasks, plants, locations, grows] = await Promise.all([
        storage.list("tasks"), storage.list("plants"), storage.list("locations"),
        storage.list("grows")
      ]);
      cache = { tasks, plants, locations, grows };
      renderList();
      fillSelectors();
    }

    function fillSelectors() {
      const plantSel = $("#task-plant");
      const locSel = $("#task-location");
      const growSel = $("#task-grow");
      const plantCur = plantSel.value, locCur = locSel.value, growCur = growSel.value;
      plantSel.replaceChildren(new Option(t("common.none"), ""));
      for (const p of cache.plants.slice().sort((a, b) => a.name.localeCompare(b.name)))
        plantSel.append(new Option(p.name, p.id));
      locSel.replaceChildren(new Option(t("common.none"), ""));
      for (const l of cache.locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)))
        locSel.append(new Option(l.name, l.id));
      growSel.replaceChildren(new Option(t("common.none"), ""));
      for (const g of cache.grows.slice().sort((a, b) => a.name.localeCompare(b.name)))
        growSel.append(new Option(g.name + (g.isDefault ? " ★" : ""), g.id));
      plantSel.value = plantCur; locSel.value = locCur;
      growSel.value = growCur || window.LeafGuru.growDomain.defaultGrowId(cache.grows) || "";
    }

    function renderList() {
      const today = td.today();
      const filter = statusFilter.value;
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      const boardEl = $("[data-task-board]");
      let rows = cache.tasks;
      if (filter !== "all") rows = rows.filter((task) => task.status === filter);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        rows = rows.filter((task) =>
          [task.title, task.description].some((v) =>
            String(v ?? "").toLowerCase().includes(q)));
      }
      rows = rows.slice().sort((a, b) => {
        const ao = td.isOverdue(a, today) ? 0 : 1, bo = td.isOverdue(b, today) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (a.status !== b.status && (a.status === "open" || b.status === "open")) return a.status === "open" ? -1 : 1;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });

      $("[data-count-open]").textContent = cache.tasks.filter((task) => task.status === "open").length;
      $("[data-count-overdue]").textContent = cache.tasks.filter((task) => td.isOverdue(task, today)).length;

      // view: list or Kanban board
      const toggle = $("[data-task-view-toggle]");
      toggle.textContent = boardMode ? "☰ List" : "▦ Board";
      // the status filter belongs to the list view only
      const showFilter = $("[data-task-show-filter]");
      if (showFilter) showFilter.hidden = boardMode;
      listEl.hidden = boardMode || rows.length === 0;
      boardEl.hidden = !boardMode;
      emptyEl.hidden = rows.length > 0;
      emptyEl.textContent = searchTerm
        ? t("common.noSearchResults")
        : filter === "all" ? t("messages.noTasks") : t("task.emptyFilter");
      if (boardMode) { renderBoard(today); return; }
      listEl.replaceChildren();

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
          due.textContent = window.LeafGuru.format.date(task.dueDate);
          if (td.isDueToday(task, today)) due.textContent += ` · ${t("common.today")}`;
        } else {
          due.textContent = "–";
        }

        const link = document.createElement("span");
        link.className = "crud-cell";
        const plantName = nameOf(cache.plants, task.plantId);
        const locName = nameOf(cache.locations, task.locationId);
        const growName = nameOf(cache.grows, task.growId);
        link.textContent = [plantName, locName, growName].filter(Boolean).join(" · ") || "–";

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
            actionBtn(t("common.delete"), () => removeTask(task), "btn--danger")
          );
          if (task.completedAt) {
            const done = document.createElement("small");
            done.className = "muted";
            done.textContent = window.LeafGuru.format.date(task.completedAt);
            actions.append(done);
          }
        }
        row.append(title, status, due, link, prio, actions);
        listEl.append(row);
      }
    }

    /** Kanban board: open / done / skipped columns, drag-and-drop cards */
    function renderBoard(today) {
      const boardEl = $("[data-task-board]");
      for (const status of ["open", "done", "skipped"]) {
        const ul = boardEl.querySelector(`[data-board-list="${status}"]`);
        ul.replaceChildren();
        ul.dataset.dropStatus = status;
        // drop target wiring (once — the ul element persists across renders)
        if (!ul._dropWired) {
          ul._dropWired = true;
          ul.addEventListener("dragover", (event) => {
            event.preventDefault();
            ul.classList.add("task-board__list--over");
          });
          ul.addEventListener("dragleave", () => ul.classList.remove("task-board__list--over"));
          ul.addEventListener("drop", (event) => {
            event.preventDefault();
            ul.classList.remove("task-board__list--over");
            const taskId = event.dataTransfer?.getData("text/plain");
            const task = cache.tasks.find((t) => t.id === taskId);
            if (task && task.status !== status) setStatus(task, status);
          });
        }
        const cards = cache.tasks
          .filter((task) => task.status === status)
          .filter((task) => matchesSearch(task))
          .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
        for (const task of cards) {
          const card = document.createElement("li");
          card.className = "task-card";
          card.draggable = true;
          if (td.isOverdue(task, today)) card.classList.add("task-card--overdue");
          card.addEventListener("dragstart", (event) => {
            event.dataTransfer?.setData("text/plain", task.id);
            event.dataTransfer && (event.dataTransfer.effectAllowed = "move");
            card.classList.add("task-card--dragging");
          });
          card.addEventListener("dragend", () => card.classList.remove("task-card--dragging"));
          const title = document.createElement("span");
          title.className = "task-card__title";
          title.textContent = task.title;
          const meta = document.createElement("span");
          meta.className = "task-card__meta muted";
          meta.textContent = [
            task.dueDate ? window.LeafGuru.format.date(task.dueDate) : null,
            td.isOverdue(task, today) ? `⚠ ${t("task.overdue")}` : null
          ].filter(Boolean).join(" · ") || "–";
          card.append(title, meta);
          ul.append(card);
        }
      }
    }

    function matchesSearch(task) {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return [task.title, task.description].some((v) =>
        String(v ?? "").toLowerCase().includes(q));
    }

    function actionBtn(label, fn, variant = "btn--ghost") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = variant;
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
      const errEl = dialog.querySelector("[data-crud-error]");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
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
      $("#task-grow").value = record?.growId ?? "";
      $("#task-stage-hint").value = record?.stageHint ?? "";
      form.elements["title"].value = record?.title ?? "";
      form.elements["description"].value = record?.description ?? "";
      window.LeafGuru.dateInput.set(form.elements["dueDate"], record?.dueDate ?? null);
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
      record.dueDate = window.LeafGuru.dateInput.parse(form.elements["dueDate"]);
      record.priority = $("#task-priority").value;
      record.plantId = $("#task-plant").value || null;
      record.locationId = $("#task-location").value || null;
      record.growId = $("#task-grow").value || null;
      record.stageHint = $("#task-stage-hint").value || null;
      if (!editingId) record.status = "open";
      try {
        await storage.put("tasks", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        window.LeafGuru.ui.reportSubmitError(form, e);
      }
    }

    // wire DOM
    $("[data-crud-new]").addEventListener("click", () => openForm(null));
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    statusFilter.addEventListener("change", renderList);
    $("[data-crud-search]").addEventListener("input", (event) => {
      searchTerm = event.target.value.trim();
      renderList();
    });
    $("[data-task-view-toggle]").addEventListener("click", () => {
      boardMode = !boardMode;
      renderList();
    });

    await refresh();
  });
})();