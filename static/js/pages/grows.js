/**
 * LeafGuru — Grows page controller.
 * A Grow groups locations (locationIds[]), plants, equipment and tasks
 * (each carries an optional growId). CRUD dialog with multi-select for
 * locations + detail dialog with linked entities.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = await window.LeafGuru.createStorage();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    let cache = { grows: [], locations: [], plants: [], equipment: [], tasks: [] };
    let searchTerm = "";
    let flashTimer;

    function flash(msg, isError = false) {
      const el = $("[data-crud-flash]");
      el.textContent = msg;
      el.hidden = false;
      el.style.color = isError ? "var(--danger)" : "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
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
      let rows = cache.grows.slice().sort((a, b) =>
        (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
        a.name.localeCompare(b.name));
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        rows = rows.filter((g) =>
          [g.name, g.notes].some((v) => String(v ?? "").toLowerCase().includes(q)));
      }
      emptyEl.hidden = rows.length > 0;
      listEl.hidden = rows.length === 0;
      emptyEl.textContent = searchTerm ? t("common.noSearchResults") : t("messages.noRecords");
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
        dates.textContent = [grow.startDate, grow.endDate]
          .filter(Boolean).map((d) => window.LeafGuru.format.date(d))
          .join(" → ") || "–";
        const counts = document.createElement("span");
        counts.className = "crud-cell";
        const nLocs = (grow.locationIds ?? []).length;
        const nPlants = cache.plants.filter((p) => p.growId === grow.id).length;
        const nTasks = cache.tasks.filter((x) => x.growId === grow.id).length;
        counts.textContent = `${nLocs} ${t("nav.locations")} · ${nPlants} ${t("nav.plants")} · ${nTasks} ${t("nav.tasks")}`
          + (grow.isDefault ? ` · ★ ${t("grow.default")}` : "");
        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        actions.append(
          actionBtn(t("grow.detail"), () => openDetail(grow)),
          actionBtn(t("common.edit"), () => openForm(grow)),
          actionBtn(t("common.delete"), () => removeGrow(grow), "btn--danger")
        );
        row.append(name, status, dates, counts, actions);
        listEl.append(row);
      }
    }

    function actionBtn(label, fn, variant = "btn--ghost") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = variant;
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    }

    async function openForm(record = null) {
      const dialog = $("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      const errEl = dialog.querySelector("[data-crud-error]");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      form.dataset.editingId = record?.id ?? "";
      $("[data-crud-form-title]").textContent = record
        ? `${t("common.edit")}: ${record.name}` : t("grow.createTitle");
      $("#grow-status").value = record?.status ?? "planned";
      window.LeafGuru.dateInput.set($("#grow-start"), record?.startDate ?? new Date().toISOString().slice(0, 10));
      window.LeafGuru.dateInput.set($("#grow-end"), record?.endDate ?? null);
      $("#grow-notes").value = record?.notes ?? "";
      $("#grow-default").checked = record?.isDefault ?? false;
      form.elements["name"].value = record?.name ?? "";
      // locations multi-select
      const locSel = $("#grow-locations");
      const selected = new Set(record?.locationIds ?? []);
      locSel.replaceChildren();
      const locs = cache.locations.length
        ? cache.locations : await storage.list("locations");
      for (const l of locs.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        const opt = new Option(`${l.name} (${t("location." + l.type)})`, l.id);
        opt.selected = selected.has(l.id);
        locSel.append(opt);
      }
      dialog.showModal();
    }

    async function submitForm(event) {
      event.preventDefault();
      const form = event.target;
      const editingId = form.dataset.editingId || null;
      const record = editingId ? await storage.get("grows", editingId) : {};
      record.name = form.elements["name"].value.trim();
      record.status = $("#grow-status").value;
      record.startDate = window.LeafGuru.dateInput.parse($("#grow-start"));
      record.endDate = window.LeafGuru.dateInput.parse($("#grow-end"));
      record.notes = $("#grow-notes").value.trim();
      record.isDefault = $("#grow-default").checked;
      record.locationIds = [...$("#grow-locations").selectedOptions].map((o) => o.value);
      try {
        // enforce a single default grow
        if (record.isDefault) {
          const others = (await storage.list("grows")).filter((g) => g.isDefault && g.id !== record.id);
          for (const other of others) {
            other.isDefault = false;
            await storage.put("grows", other);
          }
        }
        await storage.put("grows", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        window.LeafGuru.ui.reportSubmitError(form, e);
      }
    }

    async function removeGrow(grow) {
      if (!window.confirm(t("messages.confirmDelete", { name: grow.name }))) return;
      await storage.delete("grows", grow.id);
      flash(t("messages.deleted"));
      await refresh();
    }

    async function openDetail(grow) {
      const locIds = new Set(grow.locationIds ?? []);
      const locs = cache.locations.filter((l) => locIds.has(l.id));
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
        `${k.title}${k.dueDate ? ` (${t("task.dueDate")}: ${window.LeafGuru.format.date(k.dueDate)})` : ""}`);

      // equipment cost summary per currency
      const costs = window.LeafGuru.growDomain.costSummary(cache.equipment, grow.id);
      const costsUl = $("[data-detail-costs]");
      costsUl.replaceChildren();
      $("[data-detail-costs-title]").hidden = costs.length === 0;
      for (const c of costs) {
        const li = document.createElement("li");
        li.textContent = `${c.total.toFixed(2)} ${c.currency || t("common.unknown")} · ${t("grow.equipmentCosts", { count: c.count })}`;
        costsUl.append(li);
      }

      // harvest statistics
      const harvest = window.LeafGuru.growDomain.harvestSummary({
        plants: cache.plants, equipmentList: cache.equipment, growId: grow.id
      });
      const harvestUl = $("[data-detail-harvest]");
      harvestUl.replaceChildren();
      $("[data-detail-harvest-title]").hidden = !harvest;
      if (harvest) {
        const liYield = document.createElement("li");
        liYield.textContent = `${t("grow.harvestPlants", { count: harvest.plantCount })}` +
          (harvest.withYield
            ? ` · ${t("grow.totalYield", { grams: Math.round(harvest.totalYieldG) })}` +
              (harvest.avgYieldG != null ? ` · ${t("grow.avgYield", { grams: Math.round(harvest.avgYieldG) })}` : "")
            : "");
        harvestUl.append(liYield);
        const parts = [
          harvest.totalBudG > 0 ? `${t("plant.budG")}: ${Math.round(harvest.totalBudG)} g` : null,
          harvest.totalLeafG > 0 ? `${t("plant.leafG")}: ${Math.round(harvest.totalLeafG)} g` : null,
          harvest.totalSugarLeafG > 0 ? `${t("plant.sugarLeafG")}: ${Math.round(harvest.totalSugarLeafG)} g` : null,
          harvest.totalStemG > 0 ? `${t("plant.stemG")}: ${Math.round(harvest.totalStemG)} g` : null
        ].filter(Boolean);
        if (parts.length) {
          const liParts = document.createElement("li");
          liParts.textContent = parts.join(" · ");
          harvestUl.append(liParts);
        }
        for (const c of harvest.costPerG) {
          const li = document.createElement("li");
          li.textContent = t("grow.costPerGram", {
            value: c.costPerG.toFixed(2), currency: c.currency || t("common.unknown")
          });
          harvestUl.append(li);
        }
      }

      // actual stage durations across the grow's plants
      const stageLogs = cache.stageLogs ?? await storage.list("stageLogs");
      const averages = window.LeafGuru.growDomain.stageAverages({
        plants: cache.plants, stageLogs, growId: grow.id
      });
      const stageUl = $("[data-detail-stage-durations]");
      stageUl.replaceChildren();
      $("[data-detail-durations-title]").hidden = Object.keys(averages).length === 0;
      for (const [stage, a] of Object.entries(averages)) {
        const li = document.createElement("li");
        li.textContent = a.count > 1
          ? `${t("stages." + stage)}: ${t("grow.durationAvgRange", { avg: Math.round(a.avgDays), min: a.minDays, max: a.maxDays, count: a.count })}`
          : `${t("stages." + stage)}: ${t("grow.durationOne", { count: a.avgDays })}`;
        stageUl.append(li);
      }

      // multi-series growth chart: all plants of the grow + expected-height overlay
      const chartEl = $("[data-detail-chart]");
      chartEl.replaceChildren();
      const growPlants = cache.plants.filter((p) => p.growId === grow.id);
      const measurements = cache.measurements ?? await storage.list("measurements");
      const chart = window.LeafGuru.chart;
      const series = growPlants
        .map((plant) => ({
          name: plant.name,
          points: chart.seriesFromMeasurements(
            measurements.filter((m) => m.plantId === plant.id), "height")
        }))
        .filter((s) => s.points.length > 0);
      const totalPoints = series.reduce((n, s) => n + s.points.length, 0);
      $("[data-detail-chart-title]").hidden = totalPoints < 2;
      if (totalPoints >= 2) {
        // expected-height overlay: distinct expected heights of the
        // charted plants' strain templates
        const templateIds = new Set();
        for (const plant of growPlants) {
          if (plant.strainTemplateId && series.some((s) => s.name === plant.name)) {
            templateIds.add(plant.strainTemplateId);
          }
        }
        const hLines = [];
        for (const tplId of templateIds) {
          const tpl = await storage.get("strainTemplates", tplId);
          const label = series.length > 1 || hLines.length > 0
            ? `${t("strain.expectedHeightShort")} ${tpl?.expectedHeightCm} cm` : undefined;
          if (tpl?.expectedHeightCm != null) {
            hLines.push({ y: tpl.expectedHeightCm, label: label ?? undefined });
          }
        }
        const { svg, legend } = chart.multiLineChart(series, { yLabel: "cm", hLines });
        const wrap = document.createElement("div");
        wrap.className = "chart-grow";
        wrap.append(svg, legend);
        chartEl.append(wrap);
      }

      $("[data-grow-detail]").showModal();
    }

    // wire DOM
    $("[data-crud-new]").addEventListener("click", () => openForm(null));
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    $("[data-crud-search]").addEventListener("input", (event) => {
      searchTerm = event.target.value.trim();
      renderList();
    });

    await refresh();

    // deep link: /grows/?grow=<id> (e.g. from the Timeline) opens the detail
    try {
      const linkedGrow = new URLSearchParams(window.location?.search ?? "").get("grow");
      if (linkedGrow) {
        const linked = cache.grows.find((g) => g.id === linkedGrow);
        if (linked) await openDetail(linked);
        window.history?.replaceState?.(null, "", "/grows/");
      }
    } catch { /* deep links are optional in tests */ }
  });
})();