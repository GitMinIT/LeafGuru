/**
 * LeafGuru — Equipment page controller.
 * CRUD + grow selector + availableEverywhere flag + location assignment
 * editor (records from–to history in locationAssignments[]).
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

    let cache = { equipment: [], locations: [], grows: [] };
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

    const locName = (id) => cache.locations.find((l) => l.id === id)?.name ?? "–";
    const growName = (id) => cache.grows.find((g) => g.id === id)?.name ?? null;

    async function refresh() {
      const [equipment, locations, grows] = await Promise.all([
        storage.list("equipment"), storage.list("locations"), storage.list("grows")
      ]);
      cache = { equipment, locations, grows };
      renderList();
      fillSelectors();
    }

    function fillSelectors() {
      const growSel = $("#equip-grow");
      const cur = growSel.value;
      growSel.replaceChildren(new Option(t("common.none"), ""));
      for (const g of cache.grows.slice().sort((a, b) => a.name.localeCompare(b.name)))
        growSel.append(new Option(g.name, g.id));
      growSel.value = cur;
      // assignment select
      const asgSel = $("#equip-assign-location");
      const curA = asgSel.value;
      asgSel.replaceChildren(new Option(t("common.none"), ""));
      for (const l of cache.locations.filter((l) => l.active))
        asgSel.append(new Option(l.name, l.id));
      asgSel.value = curA;
    }

    function renderList() {
      const listEl = $("[data-crud-list]");
      const emptyEl = $("[data-crud-empty]");
      const rows = cache.equipment.slice().sort((a, b) => a.name.localeCompare(b.name));
      emptyEl.hidden = rows.length > 0;
      listEl.hidden = rows.length === 0;
      listEl.replaceChildren();
      for (const eq of rows) {
        const row = document.createElement("li");
        row.className = "crud-row";
        const name = document.createElement("span");
        name.className = "crud-cell crud-cell--name";
        name.textContent = eq.name;
        const cat = document.createElement("span");
        cat.className = "crud-cell";
        cat.textContent = t("equipment.categories." + eq.category);
        const status = document.createElement("span");
        status.className = "crud-cell";
        status.textContent = t("equipment.status." + eq.status);
        const place = document.createElement("span");
        place.className = "crud-cell";
        if (eq.availableEverywhere) place.textContent = t("equipment.availableEverywhere");
        else {
          const current = currentLocationId(eq);
          const g = growName(eq.growId);
          place.textContent = [current ? locName(current) : null, g ? `${t("nav.grows")}: ${g}` : null]
            .filter(Boolean).join(" · ") || "–";
        }
        const cost = document.createElement("span");
        cost.className = "crud-cell";
        cost.textContent = eq.cost != null
          ? `${eq.cost}${eq.currency ? " " + eq.currency : ""}` : "–";
        const actions = document.createElement("span");
        actions.className = "crud-cell task-actions";
        if (currentLocationId(eq) || eq.availableEverywhere) {
          actions.append(actionBtn(t("equipment.unassign"), () => unassign(eq)));
        } else {
          const sel = $("#equip-assign-location");
          actions.append(actionBtn(t("equipment.assign"), () => assign(eq, sel.value || null)));
        }
        actions.append(
          actionBtn(t("common.edit"), () => openForm(eq)),
          actionBtn(t("common.delete"), () => removeEq(eq))
        );
        row.append(name, cat, status, place, cost, actions);
        listEl.append(row);
      }
    }

    function currentLocationId(eq) {
      const open = (eq.locationAssignments ?? []).find((a) => !a.to);
      return open?.locationId ?? null;
    }

    function actionBtn(label, fn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    }

    async function assign(eq, locationId) {
      if (!locationId) { flash(t("equipment.noLocationPicked"), true); return; }
      const now = new Date().toISOString();
      const record = await storage.get("equipment", eq.id);
      record.locationAssignments = record.locationAssignments ?? [];
      // close any open assignment (safety)
      for (const a of record.locationAssignments) if (!a.to) a.to = now;
      record.locationAssignments.push({ locationId, from: now, to: null });
      try {
        await storage.put("equipment", record);
        flash(t("messages.saved"));
        await refresh();
      } catch (e) { flash(formatErrors(e), true); }
    }

    async function unassign(eq) {
      const now = new Date().toISOString();
      const record = await storage.get("equipment", eq.id);
      for (const a of record.locationAssignments ?? []) if (!a.to) a.to = now;
      try {
        await storage.put("equipment", record);
        flash(t("messages.saved"));
        await refresh();
      } catch (e) { flash(formatErrors(e), true); }
    }

    function openForm(record = null) {
      const dialog = $("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      form.dataset.editingId = record?.id ?? "";
      $("[data-crud-form-title]").textContent = record
        ? `${t("common.edit")}: ${record.name}` : t("equipment.createTitle");
      form.elements["name"].value = record?.name ?? "";
      $("#equip-category").value = record?.category ?? "other";
      $("#equip-status").value = record?.status ?? "stored";
      form.elements["specs"].value = record?.specs ?? "";
      form.elements["purchaseDate"].value = record?.purchaseDate ?? "";
      form.elements["cost"].value = record?.cost ?? "";
      $("#equip-currency").value = record?.currency ?? "EUR";
      $("#equip-grow").value = record?.growId ?? "";
      $("#equip-everywhere").checked = record?.availableEverywhere ?? false;
      form.elements["notes"].value = record?.notes ?? "";
      dialog.showModal();
    }

    async function submitForm(event) {
      event.preventDefault();
      const form = event.target;
      const editingId = form.dataset.editingId || null;
      const record = editingId ? await storage.get("equipment", editingId) : {};
      record.name = form.elements["name"].value.trim();
      record.category = $("#equip-category").value;
      record.status = $("#equip-status").value;
      record.specs = form.elements["specs"].value.trim();
      record.purchaseDate = form.elements["purchaseDate"].value || null;
      const costRaw = form.elements["cost"].value;
      record.cost = costRaw === "" ? null : Number(costRaw);
      record.currency = $("#equip-currency").value.trim() || null;
      record.growId = $("#equip-grow").value || null;
      record.availableEverywhere = $("#equip-everywhere").checked;
      record.notes = form.elements["notes"].value.trim();
      try {
        await storage.put("equipment", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        flash(e.name === "LeafGuruValidationError" ? formatErrors(e) : e.message, true);
      }
    }

    async function removeEq(eq) {
      if (!window.confirm(t("messages.confirmDelete", { name: eq.name }))) return;
      await storage.delete("equipment", eq.id);
      flash(t("messages.deleted"));
      await refresh();
    }

    // wire DOM
    $("[data-crud-new]").addEventListener("click", () => openForm(null));
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    $("[data-crud-cancel]").addEventListener("click", () => $("[data-crud-dialog]").close());
    $("[data-assign-action]").addEventListener("click", () => {
      const sel = $("#equip-assign-location");
      const eqId = $("[data-assign-equipment]").value;
      const eq = cache.equipment.find((e) => e.id === eqId);
      if (eq) assign(eq, sel.value || null);
      else flash(t("equipment.noLocationPicked"), true);
    });

    // keep the toolbar equipment select in sync with the list
    const origRenderList = renderList;
    function renderList() {
      origRenderList();
      const sel = $("[data-assign-equipment]");
      const cur = sel.value;
      sel.replaceChildren(new Option(t("common.none"), ""));
      for (const eq of cache.equipment.slice().sort((a, b) => a.name.localeCompare(b.name)))
        sel.append(new Option(eq.name, eq.id));
      sel.value = cur;
    }

    await refresh();
  });
})();