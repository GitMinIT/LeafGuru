/**
 * LeafGuru — Grows page controller.
 * A Grow groups locations, plants, equipment and tasks (each carries an
 * optional growId). CRUD dialog + detail dialog with linked entities.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    let cache = { grows: [], locations: [], plants: [], equipment: [], tasks: [] };
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

    async function refresh() {
      const [grows, locations, plants, equipment, tasks] = await Promise.all([
        storage.list("grows"), storage.list("locations"),
        storage.list("plants"), storage.list("equipment"), storage.list("tasks")
      ]);
      cache = { grows, locations, plants, equipment, tasks };
      renderList();
    }

    function renderList() {
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      const statusOrder = { active: 0, planned: 1, harvested: 2, closed: 3 };
      const rows = cache.grows.slice().sort((a, b) =>
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
        a.name.localeCompare(b.name));
      emptyEl.hidden = rows.length > 0;
      listEl.hidden = rows.length === 0;
      listEl.replaceChildren();
      for (const grow of rows) {
        const row = document.createElement("li");
        row.className = "crud-row";
        const name = document.createElement("span");
        name.className = "crud-cell crud-cell--name";
        name.textContent = grow.name;
        const status = document.createElement("span");
        status.className = `crud-cell grow-status grow-status--${grow.status}`;
        status.textContent = t("grow.status." + grow.status);
        const dates = document.createElement("span");
        dates.className = "crud-cell";
        dates.textContent = [grow.startDate, grow.endDate].filter(Boolean).join(" → ") || "–";
        const counts = document.createElement("span");
        counts.className = "crud-cell";
        const n = (list, key) => list.filter((x) => x.growId === grow.id).length;
        counts.textContent = `${n(cache.locations, "loc")} ${t("nav.locations")} · ${n(cache.plants, "p")} ${t("nav.plants")} · ${n(cache.tasks, "t")} ${t("nav.tasks")}`;
        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        actions.append(
          actionBtn(t("grow.detail"), () => openDetail(grow)),
          actionBtn(t("common.edit"), () => openForm(grow)),
          actionBtn(t("common.delete"), () => removeGrow(grow))
        );
        row.append(name, status, dates, counts, actions);
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

    function openForm(record = null) {
      const dialog = $("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      form.dataset.editingId = record?.id ?? "";
      $("[data-crud-form-title]").textContent = record
        ? `${t("common.edit")}: ${record.name}` : t("grow.createTitle");
      $("#grow-status").value = record?.status ?? "planned";
      $("#grow-start").value = record?.startDate ?? "";
      $("#grow-end").value = record?.endDate ?? "";
      $("#grow-notes").value = record?.notes ?? "";
      form.elements["name"].value = record?.name ?? "";
      dialog.showModal();
    }

    async function submitForm(event) {
      event.preventDefault();
      const form = event.target;
      const editingId = form.dataset.editingId || null;
      const record = editingId ? await storage.get("grows", editingId) : {};
      record.name = form.elements["name"].value.trim();
      record.status = $("#grow-status").value;
      record.startDate = $("#grow-start").value || null;
      record.endDate = $("#grow-end").value || null;
      record.notes = $("#grow-notes").value.trim();
      try {
        const saved = await storage.put("grows", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        flash(e.name === "LeafGuruValidationError" ? formatErrors(e) : e.message, true);
      }
    }

    async function removeGrow(grow) {
      if (!window.confirm(t("messages.confirmDelete", { name: grow.name }))) return;
      await storage.delete("grows", grow.id);
      flash(t("messages.deleted"));
      await refresh();
    }

    async function openDetail(grow) {
      const locs = cache.locations.filter((l) => l.growId === grow.id);
      const plants = cache.plants.filter((p) => p.growId === grow.id);
      const equip = cache.equipment.filter((e) => e.growId === grow.id);
      const tasks = cache.tasks.filter((k) => k.growId === grow.id && k.status === "open");

      $("[data-detail-title]").textContent = grow.name;
      const days = grow.startDate ? ` · ${t("grow.day")} ${Math.max(0, Math.floor((Date.now() - new Date(grow.startDate)) / 86400000))}` : "";
      $("[data-detail-meta]").textContent = `${t("grow.status." + grow.status)}${days}`;

      const fill = (sel, items, render) => {
        const ul = $(sel);
        ul.replaceChildren();
        if (!items.length) {
          const li = document.createElement("li");
          li.className = "muted";
          li.textContent = "–";
          ul.append(li);
          return;
        }
        for (const item of items) {
          const li = document.createElement("li");
          li.className = "crud-row";
          li.textContent = render(item);
          ul.append(li);
        }
      };
      fill("[data-detail-locations]", locs, (l) =>
        `${l.name} (${t("location." + l.type)})${l.active ? "" : " · " + t("common.inactive")}`);
      fill("[data-detail-plants]", plants, (p) =>
        `${p.name} — ${t("stages." + p.stage)} · ${t("plant.status." + p.status)}`);
      fill("[data-detail-equipment]", equip, (e) =>
        `${e.name} — ${t("equipment.categories." + e.category)}${e.availableEverywhere ? " · " + t("equipment.availableEverywhere") : ""}`);
      fill("[data-detail-tasks]", tasks, (k) =>
        `${k.title}${k.dueDate ? ` (${t("task.dueDate")}: ${k.dueDate})` : ""}`);

      $("[data-grow-detail]").showModal();
    }

    // wire DOM
    $("[data-crud-new]").addEventListener("click", () => openForm(null));
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    $("[data-crud-cancel]").addEventListener("click", () => $("[data-crud-dialog]").close());
    $("[data-detail-close]").addEventListener("click", () => $("[data-grow-detail]").close());

    await refresh();
  });
})();