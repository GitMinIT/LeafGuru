/**
 * LeafGuru — Plants page controller.
 *
 * List + create + detail (timeline, stage change, location move,
 * measurements). Uses CrudPage for list/form mechanics where possible,
 * custom logic for plant lifecycle actions (plant-domain).
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    const d = window.LeafGuru.plantDomain;
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    const STAGES = d.stages;
    const urlPool = [];

    async function refresh() {
      const [plants, locations, strainTemplates, stageLogs] = await Promise.all([
        storage.list("plants"), storage.list("locations"),
        storage.list("strainTemplates"), storage.list("stageLogs")
      ]);

      // --- list ---
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      listEl.replaceChildren();
      emptyEl.hidden = plants.length > 0;
      listEl.hidden = plants.length === 0;
      const locName = (id) => locations.find((l) => l.id === id)?.name ?? t("plant.noLocation");
      for (const plant of plants.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))) {
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
        const status = document.createElement("span");
        status.className = "crud-cell";
        status.textContent = t("plant.status." + plant.status);
        const actions = document.createElement("span");
        actions.className = "crud-cell";
        const detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.textContent = t("plant.detail");
        detailBtn.addEventListener("click", () => openDetail(plant.id));
        actions.append(detailBtn);
        row.append(name, stage, loc, status, actions);
        listEl.append(row);
      }

      // --- create form: strain template select options ---
      const tplSelect = $("#plant-template");
      tplSelect.replaceChildren(new Option(t("common.none"), ""));
      for (const tpl of strainTemplates.sort((a, b) => a.name.localeCompare(b.name))) {
        tplSelect.append(new Option(tpl.name + (tpl.breeder ? ` (${tpl.breeder})` : ""), tpl.id));
      }
      // location select options
      const locSelects = [$("#plant-location"), $("#move-location")];
      for (const sel of locSelects) {
        const current = sel.value;
        sel.replaceChildren(new Option(t("plant.noLocation"), ""));
        for (const loc of locations.filter((l) => l.active)) {
          sel.append(new Option(loc.name, loc.id));
        }
        sel.value = current;
      }
      // stage select options
      const stageSel = $("#new-stage");
      stageSel.replaceChildren();
      for (const s of STAGES) stageSel.append(new Option(t("stages." + s), s));

      return { plants, locations, stageLogs };
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
        germinationDate: f.elements["germinationDate"].value || null,
        stage,
        locationId: f.elements["locationId"].value || null,
        status: "growing"
      };
      try {
        const plant = await storage.put("plants", base);
        // initial stage log
        const { stageLogs } = d.applyStageChange({ plant, stageLogs: [], newStage: stage });
        for (const log of stageLogs) await storage.put("stageLogs", log);
        f.reset();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) { flash(e.name === "LeafGuruValidationError" ? formatErrors(e) : e.message, true); }
    });

    // --- detail panel ---
    async function openDetail(plantId) {
      const [plant, stageLogs, locations, measurements, locationChanges] = await Promise.all([
        storage.get("plants", plantId), storage.list("stageLogs"),
        storage.list("locations"), storage.list("measurements"),
        storage.list("locationChanges")
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

      const open = d.openStage(stageLogs, plant.id);
      const days = d.daysSince(open?.enteredAt ?? plant.germinationDate ?? plant.createdAt);
      $("[data-detail-stage]").textContent = t("stages." + plant.stage) + (days != null ? ` · ${t("plant.daysInStage")}: ${days}` : "");
      $("[data-detail-age]").textContent = plant.germinationDate
        ? `${t("plant.age")}: ${d.daysSince(plant.germinationDate)}` : "";
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
        li.textContent = `${t("stages." + log.stage)} — ${log.enteredAt.slice(0, 10)}`
          + (log.leftAt ? ` → ${log.leftAt.slice(0, 10)}` : ` (${t("common.active")})`)
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
        li.textContent = `${c.changedAt.slice(0, 10)}: ${from} → ${to}${c.reason ? ` (${c.reason})` : ""}`;
        lh.append(li);
      }

      // photos
      const photos = (await storage.list("photos")).filter((p) => p.plantId === plant.id)
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
        caption.textContent = `${photo.takenAt.slice(0, 10)}`
          + (photo.phaseTag ? ` · ${t("stages." + photo.phaseTag)}` : "")
          + (photo.note ? ` · ${photo.note}` : "");
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = t("common.delete");
        del.addEventListener("click", async () => {
          if (!window.confirm(t("messages.confirmDelete", { name: "photo " + photo.takenAt.slice(0, 10) }))) return;
          await storage.delete("photos", photo.id);
          URL.revokeObjectURL(url);
          flash(t("messages.deleted"));
          await openDetail(plantId);
        });
        card.append(img, caption, del);
        grid.append(card);
      }

      // measurements
      const ms = measurements.filter((m) => m.plantId === plant.id)
        .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
      const ml = $("[data-measurement-list]");
      ml.replaceChildren();
      $("[data-measurements-empty]").hidden = ms.length > 0;
      for (const m of ms) {
        const li = document.createElement("li");
        li.textContent = `${m.measuredAt.slice(0, 10)} — ${m.type}: ${m.value} ${m.unit}${m.note ? ` (${m.note})` : ""}`;
        ml.append(li);
      }
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
      } catch (e) { flash(formatErrors(e), true); }
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

    function formatErrors(e) {
      return `${t("messages.validationFailed")}: ` +
        e.errors.slice(0, 3).map((x) => `${x.path.replace(/^\$./, "")} ${x.message}`).join("; ");
    }
    let flashTimer;
    function flash(msg, isError = false) {
      const el = $("[data-crud-flash]");
      el.textContent = msg;
      el.hidden = false;
      el.style.color = isError ? "var(--danger)" : "";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.hidden = true; }, 4000);
    }

    await refresh();
  });
})();