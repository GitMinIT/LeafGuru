/**
 * LeafGuru — quick log dialog controller (journal entries).
 *
 * One <dialog> lives in base.html on every page; a topbar "+ Log" button
 * opens it with the active grow pre-selected (fallback: first active
 * grow, else any). Writes a LogEntry via the adapter, attaches selected
 * photos (photo.logEntryId), then refreshes the page if it lists data.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  async function openLogDialog({ presetGrowId = null } = {}) {
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    // ensure i18n + schemas are ready even if the page init hasn't finished
    await window.LeafGuru.i18n.init();
    if (!Object.keys(window.LeafGuru.schemas ?? {}).length) await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage ??= new window.LeafGuru.LocalAdapter();
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);
    const dlg = $("[data-log-dialog]");
    if (!dlg) return;
    const form = dlg.querySelector("form");
    const errEl = dlg.querySelector("[data-log-error]");
    errEl.hidden = true;
    errEl.textContent = "";
    // Reset BEFORE the selects are rebuilt below: form.reset() restores
    // every control to its default selection, which would otherwise wipe
    // the grow pre-selection made a few lines down (and leave the
    // "required" grow select empty -> the browser blocks the submit and
    // the journal entry is silently never saved).
    form.reset();

    // fills: grow select, category select, plant multi-select, location
    const [grows, plants, locations] = await Promise.all([
      storage.list("grows"), storage.list("plants"), storage.list("locations")
    ]);
    const growSel = $("[data-log-grow]");
    growSel.replaceChildren(new Option(t("history.pickGrow"), ""));
    const order = { active: 0, planned: 1, harvested: 2, closed: 3 };
    for (const g of grows.slice().sort((a, b) =>
      (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name))) {
      growSel.append(new Option(g.name, g.id));
    }
    const chosen = presetGrowId
      ?? (window.LeafGuru.quickLog?.lastGrowId && grows.some((g) => g.id === window.LeafGuru.quickLog.lastGrowId)
        ? window.LeafGuru.quickLog.lastGrowId : null);
    growSel.value = chosen
      ?? window.LeafGuru.growDomain.defaultGrowId(grows)
      ?? (grows[0]?.id ?? "");

    // multi-category chips + category-dependent fields
    const chipsWrap = $("[data-log-categories]");
    chipsWrap.replaceChildren();
    for (const cat of window.LeafGuru.logDomain.categories) {
      const label = document.createElement("label");
      label.className = "log-chip";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = cat;
      box.addEventListener("change", updateCategoryFields);
      const span = document.createElement("span");
      span.textContent = t("log.categories." + cat);
      label.append(box, span);
      chipsWrap.append(label);
    }

    // which optional fields belong to which category — driven by the
    // domain map (union of picked categories); labels carry
    // data-log-field="<field>"
    window.LeafGuru.quickLog._selectedCategories = () =>
      [...chipsWrap.querySelectorAll("input:checked")]
        .map((i) => i.value);
    function updateCategoryFields() {
      const visible = new Set(window.LeafGuru.logDomain.fieldsFor(
        window.LeafGuru.quickLog._selectedCategories()));
      for (const label of document.querySelectorAll("[data-log-field]")) {
        label.hidden = !visible.has(label.dataset.logField);
      }
    }
    window.LeafGuru.quickLog._updateCategoryFields = updateCategoryFields;

    // "When" input: text field formatted per user settings
    const atInput = $("[data-log-at]");
    window.LeafGuru.dateInput.set(atInput, new Date().toISOString());

    const plantSel = $("[data-log-plants]");
    plantSel.replaceChildren();
    for (const plant of plants.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      if (plant.growId === growSel.value || plant.status === "growing")
        plantSel.append(new Option(plant.name, plant.id));
    }

    const locSel = $("[data-log-location]");
    locSel.replaceChildren(new Option(t("common.none"), ""));
    for (const loc of locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)))
      locSel.append(new Option(loc.name, loc.id));

    // plant list follows the grow selection
    growSel.onchange = () => {
      const gid = growSel.value;
      const selected = new Set([...plantSel.selectedOptions].map((o) => o.value));
      plantSel.replaceChildren();
      for (const plant of plants.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        if (plant.growId === gid || plant.status === "growing")
          plantSel.append(new Option(plant.name, plant.id));
      }
      for (const opt of [...plantSel.selectedOptions]) opt.selected = selected.has(opt.value);
    };

    // prefill "When" with the current datetime (settings format/zone)
    window.LeafGuru.dateInput.set(atInput, new Date().toISOString());
    updateCategoryFields();
    dlg.showModal();
  }

  async function submitLog(event) {
    event.preventDefault();
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);
    const dlg = $("[data-log-dialog]");
    const form = dlg.querySelector("form");
    const errEl = dlg.querySelector("[data-log-error]");
    const storage = window.LeafGuru.storage;
    const growId = $("[data-log-grow]").value;
    if (!growId) {
      errEl.textContent = t("log.pickGrow");
      errEl.hidden = false;
      return;
    }
    if (!window.LeafGuru.quickLog._selectedCategories().length) {
      errEl.textContent = t("log.pickCategory");
      errEl.hidden = false;
      return;
    }
    const entry = window.LeafGuru.logDomain.buildEntry({
      growId,
      at: window.LeafGuru.dateInput.parse($("[data-log-at]")),
      categories: window.LeafGuru.quickLog._selectedCategories(),
      text: form.elements["text"].value,
      amountL: form.elements["amountL"].value,
      ph: form.elements["ph"].value,
      ec: form.elements["ec"].value,
      tempC: form.elements["tempC"].value,
      humidityPct: form.elements["humidityPct"]?.value ?? null,
      product: form.elements["product"]?.value ?? null,
      dose: form.elements["dose"]?.value ?? null,
      technique: form.elements["technique"]?.value ?? null,
      stressLevel: form.elements["stressLevel"]?.value ?? null,
      defoliationStyle: form.elements["defoliationStyle"]?.value ?? null,
      defoliationPercent: form.elements["defoliationPercent"]?.value ?? null,
      fermentationNote: form.elements["fermentationNote"]?.value ?? null,
      plantIds: [...$("[data-log-plants]").selectedOptions].map((o) => o.value),
      locationId: $("[data-log-location]").value || null
    });
    try {
      const saved = await storage.put("logEntries", entry);
      window.LeafGuru.quickLog.lastGrowId = growId;
      // attach photos
      const files = [...($("[data-log-photos]").files ?? [])];
      $("[data-log-photos]").value = "";
      for (const file of files) {
        try {
          const rec = window.LeafGuru.photos.buildRecord({ logEntry: saved, file });
          await storage.put("photos", rec);
        } catch (e) { /* size/mime errors per file — keep the rest */ }
      }
      dlg.close();
      window.LeafGuru.quickLog.onSaved?.(saved);
    } catch (e) {
      errEl.textContent = e.name === "LeafGuruValidationError"
        ? window.LeafGuru.ui.formatErrors(e) : e.message;
      errEl.hidden = false;
    }
  }

  window.LeafGuru.quickLog = {
    lastGrowId: null,
    onSaved: null,
    open: openLogDialog,
    submit: submitLog
  };
})();