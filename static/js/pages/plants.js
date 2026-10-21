/**
 * LeafGuru — Plants page controller.
 *
 * List (searchable) + create + edit + delete-with-cascade + detail
 * (timeline, stage change, location move, measurements with edit/remove,
 * photos, SVG growth chart). Uses plant-domain for lifecycle logic.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    const d = window.LeafGuru.plantDomain;
    const chart = window.LeafGuru.chart;
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    const STAGES = d.stages;
    const urlPool = [];
    let cache = { plants: [], locations: [], strainTemplates: [], grows: [] };
    let searchTerm = "";

    function flash(msg, isError = false) {
      const el = $("[data-crud-flash]");
      el.textContent = msg;
      el.hidden = false;
      el.style.color = isError ? "var(--danger)" : "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
    }
    let flashTimer;

    const actionBtn = (label, fn, variant = "btn--ghost") => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = variant;
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    };

    async function refresh() {
      const [plants, locations, strainTemplates, grows] = await Promise.all([
        storage.list("plants"), storage.list("locations"),
        storage.list("strainTemplates"), storage.list("grows")
      ]);
      cache = { plants, locations, strainTemplates, grows };
      renderList();
      fillSelectors();
    }

    function fillSelectors() {
      const growSel = $("#plant-grow");
      const growCur = growSel.value;
      growSel.replaceChildren(new Option(t("common.none"), ""));
      for (const g of cache.grows.slice().sort((a, b) => a.name.localeCompare(b.name)))
        growSel.append(new Option(g.name + (g.isDefault ? " ★" : ""), g.id));
      growSel.value = growCur || window.LeafGuru.growDomain.defaultGrowId(cache.grows) || "";

      const tplSelect = $("#plant-template");
      tplSelect.replaceChildren(new Option(t("common.none"), ""));
      for (const tpl of cache.strainTemplates.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        tplSelect.append(new Option(tpl.name + (tpl.breeder ? ` (${tpl.breeder})` : ""), tpl.id));
      }

      const locSelects = [$("#plant-location"), $("#move-location"), $("#edit-location")];
      for (const sel of locSelects) {
        const current = sel.value;
        sel.replaceChildren(new Option(t("plant.noLocation"), ""));
        for (const loc of cache.locations.filter((l) => l.active)) {
          sel.append(new Option(loc.name, loc.id));
        }
        sel.value = current;
      }

      const stageSel = $("#new-stage");
      stageSel.replaceChildren();
      for (const s of STAGES) stageSel.append(new Option(t("stages." + s), s));
    }

    function renderList() {
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      let plants = cache.plants;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        plants = plants.filter((p) =>
          [p.name, p.customStrain, p.notes].some((v) =>
            String(v ?? "").toLowerCase().includes(q)) ||
          cache.strainTemplates.find((tpl) => tpl.id === p.strainTemplateId)?.name
            ?.toLowerCase().includes(q));
      }
      plants = plants.slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

      listEl.replaceChildren();
      emptyEl.hidden = plants.length > 0;
      listEl.hidden = plants.length === 0;
      emptyEl.textContent = searchTerm
        ? t("common.noSearchResults")
        : t("messages.noRecords");

      const locName = (id) => cache.locations.find((l) => l.id === id)?.name ?? t("plant.noLocation");
      const growName = (id) => cache.grows.find((g) => g.id === id)?.name ?? "–";
      for (const plant of plants) {
        const row = document.createElement("li");
        row.className = "crud-row";
        const name = document.createElement("span");
        name.className = "crud-cell crud-cell--name";
        name.textContent = plant.name;
        const stage = document.createElement("span");
        stage.className = "crud-cell";
        stage.textContent = t("stages." + plant.stage);
        const loc = document.createElement("span");
        loc.className = "crud-cell";
        loc.textContent = locName(plant.locationId);
        const grow = document.createElement("span");
        grow.className = "crud-cell";
        grow.textContent = plant.growId ? growName(plant.growId) : "–";
        const status = document.createElement("span");
        status.className = "crud-cell";
        status.textContent = t("plant.status." + plant.status);
        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        actions.append(
          actionBtn(t("plant.detail"), () => openDetail(plant.id)),
          actionBtn(t("common.edit"), () => openEdit(plant)),
          actionBtn(t("common.delete"), () => removePlant(plant), "btn--danger")
        );
        row.append(name, stage, loc, grow, status, actions);
        listEl.append(row);
      }
    }

    // --- create plant (opens initial StageLog) ---
    $("#plant-create").addEventListener("submit", async (event) => {
      event.preventDefault();
      const f = event.target;
      const tplId = f.elements["strainTemplateId"].value || null;
      const stage = f.elements["stage"].value || "planned";
      const base = {
        name: f.elements["name"].value,
        strainTemplateId: tplId,
        customStrain: f.elements["customStrain"].value || null,
        sex: f.elements["sex"].value || "unknown",
        germinationDate: window.LeafGuru.dateInput.parse(f.elements["germinationDate"]),
        stage,
        locationId: f.elements["locationId"].value || null,
        growId: f.elements["growId"].value || null,
        status: "growing"
      };
      try {
        const plant = await storage.put("plants", base);
        const { stageLogs } = d.applyStageChange({ plant, stageLogs: [], newStage: stage });
        for (const log of stageLogs) await storage.put("stageLogs", log);
        f.reset();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        flash(e.name === "LeafGuruValidationError" ? window.LeafGuru.ui.formatErrors(e) : e.message, true);
      }
    });

    // --- edit ---
    async function openEdit(plant) {
      const dialog = $("[data-plant-edit]");
      const form = dialog.querySelector("form");
      form.reset();
      const errEl = dialog.querySelector("[data-crud-error]");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      form.dataset.plantId = plant.id;
      $("[data-edit-title]").textContent = `${t("common.edit")}: ${plant.name}`;
      form.elements["name"].value = plant.name ?? "";
      form.elements["customStrain"].value = plant.customStrain ?? "";
      window.LeafGuru.dateInput.set(form.elements["germinationDate"], plant.germinationDate ?? null);
      form.elements["notes"].value = plant.notes ?? "";
      $("#edit-sex").value = plant.sex ?? "unknown";
      $("#edit-status").value = plant.status ?? "growing";
      $("#edit-yield").value = plant.harvestYieldG ?? "";
      window.LeafGuru.dateInput.set($("#edit-harvested"), plant.harvestedAt ?? null);
      $("#edit-bud").value = plant.budG ?? "";
      $("#edit-leaf").value = plant.leafG ?? "";
      $("#edit-sugarleaf").value = plant.sugarLeafG ?? "";
      $("#edit-stem").value = plant.stemG ?? "";
      $("#edit-smell").value = plant.smellTerpenes ?? "";
      // template select
      const tplSel = $("#edit-template");
      tplSel.replaceChildren(new Option(t("common.none"), ""));
      for (const tpl of cache.strainTemplates.slice().sort((a, b) => a.name.localeCompare(b.name)))
        tplSel.append(new Option(tpl.name + (tpl.breeder ? ` (${tpl.breeder})` : ""), tpl.id));
      tplSel.value = plant.strainTemplateId ?? "";
      // grow select
      const growSel = $("#edit-grow");
      growSel.replaceChildren(new Option(t("common.none"), ""));
      for (const g of cache.grows.slice().sort((a, b) => a.name.localeCompare(b.name)))
        growSel.append(new Option(g.name + (g.isDefault ? " ★" : ""), g.id));
      growSel.value = plant.growId || window.LeafGuru.growDomain.defaultGrowId(cache.grows) || "";
      // location select (filled in fillSelectors)
      $("#edit-location").value = plant.locationId ?? "";
      dialog.showModal();
    }

    $("[data-plant-edit] form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const plantId = form.dataset.plantId;
      const record = await storage.get("plants", plantId);
      record.name = form.elements["name"].value.trim();
      record.strainTemplateId = $("#edit-template").value || null;
      record.customStrain = form.elements["customStrain"].value.trim() || null;
      record.sex = $("#edit-sex").value;
      record.germinationDate = window.LeafGuru.dateInput.parse(form.elements["germinationDate"]);
      record.status = $("#edit-status").value;
      const yieldRaw = $("#edit-yield").value.trim();
      record.harvestYieldG = yieldRaw === "" ? null : Number(yieldRaw);
      record.harvestedAt = window.LeafGuru.dateInput.parse($("#edit-harvested"));
      const optNum = (sel) => {
        const raw = $(sel).value.trim();
        return raw === "" ? null : Number(raw);
      };
      record.budG = optNum("#edit-bud");
      record.leafG = optNum("#edit-leaf");
      record.sugarLeafG = optNum("#edit-sugarleaf");
      record.stemG = optNum("#edit-stem");
      record.smellTerpenes = $("#edit-smell").value.trim() || null;
      record.locationId = $("#edit-location").value || null;
      record.growId = $("#edit-grow").value || null;
      record.notes = form.elements["notes"].value.trim() || null;
      try {
        await storage.put("plants", record);
        $("[data-plant-edit]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        window.LeafGuru.ui.reportSubmitError(form, e);
      }
    });

    // --- delete with cascade ---
    async function removePlant(plant) {
      if (!window.confirm(t("messages.confirmDelete", { name: plant.name }))) return;
      const [stageLogs, measurements, locationChanges, photos] = await Promise.all([
        storage.list("stageLogs"), storage.list("measurements"),
        storage.list("locationChanges"), storage.list("photos")
      ]);
      const cascade = d.cascadeRecords({ plant, stageLogs, measurements, locationChanges, photos });
      const n = Object.values(cascade).reduce((sum, list) => sum + list.length, 0);
      if (n && !window.confirm(t("plant.confirmCascade", { count: n }))) return;
      for (const [entity, list] of Object.entries(cascade))
        for (const rec of list) await storage.delete(entity, rec.id);
      await storage.delete("plants", plant.id);
      flash(t("messages.deleted"));
      $("[data-plant-detail]").hidden = true;
      await refresh();
    }

    // --- detail panel ---
    async function openDetail(plantId) {
      const [plant, stageLogs, locations, measurements, locationChanges, photosAll] = await Promise.all([
        storage.get("plants", plantId), storage.list("stageLogs"),
        storage.list("locations"), storage.list("measurements"),
        storage.list("locationChanges"), storage.list("photos")
      ]);
      const panel = $("[data-plant-detail]");
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth" });
      panel.dataset.plantId = plantId;

      $("[data-detail-name]").textContent = plant.name;
      $("[data-detail-strain]").textContent =
        (plant.strainTemplateId
          ? (await storage.get("strainTemplates", plant.strainTemplateId))?.name ?? t("common.unknown")
          : plant.customStrain) ?? t("common.unknown");
      $("[data-detail-status]").textContent = t("plant.status." + plant.status);

      // harvest yield (if recorded)
      const yieldEl = $("[data-detail-yield]");
      const parts = [
        plant.harvestYieldG != null ? `${Math.round(plant.harvestYieldG)} g` : null,
        plant.budG != null ? `${t("plant.budG")}: ${Math.round(plant.budG)} g` : null,
        plant.leafG != null ? `${t("plant.leafG")}: ${Math.round(plant.leafG)} g` : null,
        plant.sugarLeafG != null ? `${t("plant.sugarLeafG")}: ${Math.round(plant.sugarLeafG)} g` : null,
        plant.stemG != null ? `${t("plant.stemG")}: ${Math.round(plant.stemG)} g` : null,
        plant.smellTerpenes ? `${t("plant.smellTerpenes")}: ${plant.smellTerpenes}` : null
      ].filter(Boolean);
      if (parts.length) {
        yieldEl.hidden = false;
        yieldEl.textContent = ` · ${parts.join(" · ")}`;
      } else {
        yieldEl.hidden = true;
      }

      const open = d.openStage(stageLogs, plant.id);
      const days = d.daysSince(open?.enteredAt ?? plant.germinationDate ?? plant.createdAt);
      let stageText = t("stages." + plant.stage) + (days != null ? ` · ${t("plant.daysInStage")}: ${days}` : "");
      // stage countdown vs. strain template expectation
      const strainTemplate = plant.strainTemplateId
        ? await storage.get("strainTemplates", plant.strainTemplateId)
        : null;
      const progress = d.stageProgress({ plant, stageLogs, strainTemplate });
      if (progress) {
        stageText += ` · ${t("plant.stageProgress", {
          day: progress.day, expected: progress.expected
        })}`;
        if (progress.overdue) stageText += ` (${t("plant.stageOverdue", { count: -progress.remaining })})`;
      }
      $("[data-detail-stage]").textContent = stageText;
      $("[data-detail-age]").textContent = plant.germinationDate
        ? ` · ${t("plant.age")}: ${d.daysSince(plant.germinationDate)}` : "";
      $("[data-detail-location]").textContent =
        locations.find((l) => l.id === plant.locationId)?.name ?? t("plant.noLocation");

      // stage history
      const tl = $("[data-stage-history]");
      tl.replaceChildren();
      const timeline = d.timelineFor(stageLogs, plant.id);
      $("[data-stage-history-empty]").hidden = timeline.length > 0;
      for (const log of timeline) {
        const li = document.createElement("li");
        const dur = log.leftAt ? d.daysSince(log.enteredAt, log.leftAt) : null;
        li.textContent = `${t("stages." + log.stage)} — ${window.LeafGuru.format.date(log.enteredAt)}`
          + (log.leftAt ? ` → ${window.LeafGuru.format.date(log.leftAt)}` : ` (${t("common.active")})`)
          + (dur != null ? ` · ${dur}d` : "");
        tl.append(li);
      }

      // location history
      const lh = $("[data-location-history]");
      lh.replaceChildren();
      const changes = locationChanges.filter((c) => c.plantId === plant.id)
        .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
      $("[data-location-history-empty]").hidden = changes.length > 0;
      for (const c of changes) {
        const li = document.createElement("li");
        const from = locations.find((l) => l.id === c.fromLocationId)?.name ?? t("plant.noLocation");
        const to = locations.find((l) => l.id === c.toLocationId)?.name ?? t("plant.noLocation");
        li.textContent = `${window.LeafGuru.format.date(c.changedAt)}: ${from} → ${to}${c.reason ? ` (${c.reason})` : ""}`;
        lh.append(li);
      }

      // photos
      const photos = photosAll.filter((p) => p.plantId === plant.id)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
      const grid = $("[data-photo-grid]");
      grid.replaceChildren();
      $("[data-photos-empty]").hidden = photos.length > 0;
      for (const photo of photos) {
        const card = document.createElement("figure");
        card.className = "photo-card";
        const img = document.createElement("img");
        const url = await window.LeafGuru.photos.urlFor(photo);
        urlPool.push(url);
        img.src = url;
        img.alt = photo.note || "photo";
        img.loading = "lazy";
        const caption = document.createElement("figcaption");
        caption.className = "muted";
        caption.textContent = `${window.LeafGuru.format.date(photo.takenAt)}`
          + (photo.phaseTag ? ` · ${t("stages." + photo.phaseTag)}` : "")
          + (photo.note ? ` · ${photo.note}` : "");
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = t("common.delete");
        del.addEventListener("click", async () => {
          if (!window.confirm(t("messages.confirmDelete", { name: "photo " + window.LeafGuru.format.date(photo.takenAt) }))) return;
          await storage.delete("photos", photo.id);
          URL.revokeObjectURL(url);
          flash(t("messages.deleted"));
          await openDetail(plantId);
        });
        card.append(img, caption, del);
        grid.append(card);
      }

      // measurements (with edit/remove)
      const ms = measurements.filter((m) => m.plantId === plant.id)
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
      const ml = $("[data-measurement-list]");
      ml.replaceChildren();
      $("[data-measurements-empty]").hidden = ms.length > 0;
      for (const m of ms) {
        const li = document.createElement("li");
        li.className = "crud-row";
        const text = document.createElement("span");
        text.className = "crud-cell";
        text.textContent = `${window.LeafGuru.format.date(m.measuredAt)} — ${m.type}: ${m.value} ${m.unit}${m.note ? ` (${m.note})` : ""}`;
        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        actions.append(
          actionBtn(t("common.edit"), () => editMeasurement(m)),
          actionBtn(t("common.delete"), async () => {
            if (!window.confirm(t("messages.confirmDelete", { name: `${m.type} ${window.LeafGuru.format.date(m.measuredAt)}` }))) return;
            await storage.delete("measurements", m.id);
            flash(t("messages.deleted"));
            await openDetail(plantId);
          })
        );
        li.append(text, actions);
        ml.append(li);
      }

      // growth chart (height series)
      const chartEl = $("[data-growth-chart]");
      chartEl.replaceChildren();
      const series = chart.seriesFromMeasurements(
        measurements.filter((m) => m.plantId === plant.id), "height");
      if (series.length >= 2) {
        const title = document.createElement("h4");
        title.textContent = `${t("plant.growthChart")} (cm)`;
        chartEl.append(title, chart.lineChart(series, { yLabel: "cm" }));
        chartEl.hidden = false;
      } else {
        chartEl.hidden = true;
      }
    }

    // measurement editing
    async function editMeasurement(m) {
      const type = $("#measure-type");
      const value = $("#measure-value");
      const unit = $("#measure-unit");
      const note = $("#measure-note");
      const updated = window.prompt(
        t("plant.editMeasurement"),
        `${m.type}|${m.value}|${m.unit}|${m.note ?? ""}`);
      if (updated == null) return;
      const [nType, nValue, nUnit, nNote] = updated.split("|");
      const record = await storage.get("measurements", m.id);
      if (nType?.trim()) record.type = nType.trim();
      const parsed = Number(nValue);
      if (nValue?.trim() !== "" && !Number.isNaN(parsed)) record.value = parsed;
      if (nUnit?.trim()) record.unit = nUnit.trim();
      record.note = (nNote ?? "").trim();
      try {
        await storage.put("measurements", record);
        flash(t("messages.saved"));
        await openDetail(m.plantId);
      } catch (e) { flash(e.name === "LeafGuruValidationError" ? window.LeafGuru.ui.formatErrors(e) : e.message, true); }
    }

    // stage change
    $("[data-action='change-stage']").addEventListener("click", async () => {
      const plantId = $("[data-plant-detail]").dataset.plantId;
      const plant = await storage.get("plants", plantId);
      const newStage = $("#new-stage").value;
      try {
        const logs = await storage.list("stageLogs");
        const { plant: p2, stageLogs: logs2 } = d.applyStageChange({ plant, stageLogs: logs, newStage });
        await storage.put("plants", p2);
        for (const log of logs2) await storage.put("stageLogs", log);
        flash(t("messages.stageChanged"));
        await openDetail(plantId);
        await refresh();
      } catch (e) { flash(e.message, true); }
    });

    // location move
    $("[data-action='move-location']").addEventListener("click", async () => {
      const plantId = $("[data-plant-detail]").dataset.plantId;
      const plant = await storage.get("plants", plantId);
      const to = $("#move-location").value || null;
      const reason = $("#move-reason").value || "";
      const { plant: p2, locationChange } = d.applyLocationChange({ plant, toLocationId: to, reason });
      if (!locationChange) { flash(t("messages.saved")); return; }
      await storage.put("plants", p2);
      await storage.put("locationChanges", locationChange);
      flash(t("messages.locationChanged"));
      await openDetail(plantId);
      await refresh();
    });

    // measurement
    $("[data-action='add-measurement']").addEventListener("click", async () => {
      const plantId = $("[data-plant-detail]").dataset.plantId;
      const plant = await storage.get("plants", plantId);
      const type = $("#measure-type").value.trim() || "height";
      const value = Number($("#measure-value").value);
      const unit = $("#measure-unit").value.trim() || "cm";
      if (Number.isNaN(value)) { flash(t("messages.validationFailed"), true); return; }
      const m = d.buildMeasurement({ plant, type, value, unit, note: $("#measure-note").value.trim() });
      try {
        await storage.put("measurements", m);
        flash(t("messages.saved"));
        await openDetail(plantId);
      } catch (e) { flash(e.name === "LeafGuruValidationError" ? window.LeafGuru.ui.formatErrors(e) : e.message, true); }
    });

    $("[data-action='add-photos']").addEventListener("click", () => $("#photo-input").click());
    $("#photo-input").addEventListener("change", async (event) => {
      const files = [...event.target.files];
      event.target.value = "";
      if (!files.length) return;
      const plantId = $("[data-plant-detail]").dataset.plantId;
      const plant = await storage.get("plants", plantId);
      const phaseTag = $("#photo-phase").value || null;
      const note = $("#photo-note").value.trim();
      let added = 0, failed = 0;
      for (const file of files) {
        try {
          const rec = window.LeafGuru.photos.buildRecord({ plant, file, note, phaseTag });
          await storage.put("photos", rec);
          added++;
        } catch (e) { failed++; flash(e.message, true); }
      }
      if (added) { flash(t("plant.photoAdded") + (failed ? ` (${failed} failed)` : "")); await openDetail(plantId); }
    });

    $("[data-action='close-detail']").addEventListener("click", () => {
      for (const url of urlPool) URL.revokeObjectURL(url);
      urlPool.length = 0;
      $("[data-plant-detail]").hidden = true;
    });

    // search
    $("[data-crud-search]").addEventListener("input", (event) => {
      searchTerm = event.target.value.trim();
      renderList();
    });

    await refresh();

    // deep link: /plants/?plant=<id> (e.g. from the Timeline) opens the detail
    try {
      const linkedPlant = new URLSearchParams(window.location?.search ?? "").get("plant");
      if (linkedPlant) {
        const linked = cache.plants.find((p) => p.id === linkedPlant);
        if (linked) await openDetail(linked.id);
        window.history?.replaceState?.(null, "", "/plants/");
      }
    } catch { /* deep links are optional (tests, file URLs) */ }
  });
})();