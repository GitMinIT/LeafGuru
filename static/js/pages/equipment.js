/**
 * LeafGuru — Equipment page controller.
 * Grid of square tiles (emoji or uploaded image) with a + tile to add.
 * Hovering a tile shows a gear (edit) in its upper-left corner; the
 * dialog covers all properties incl. picture upload / emoji picker and
 * the location-assignment editor (from–to history per locationAssignments[]).
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
    let searchTerm = "";
    let flashTimer;
    // dialog-local icon state: { icon: emoji|null, image: dataURL|null }
    let iconState = { icon: null, image: null };

    const CATEGORIES = ["light", "pot", "soil", "fan", "filter", "nutrient", "sensor", "other"];
    const CATEGORY_EMOJI = {
      light: "💡", pot: "🪴", soil: "🌱", fan: "🌀",
      filter: "🌀", nutrient: "🧪", sensor: "🌡️", other: "🧰"
    };
    const EMOJI_CHOICES = [
      "💡", "🪴", "🌱", "🌀", "🧪", "🌡️", "🧰", "💧", "⏲️", "🔋",
      "🔌", "🪣", "🧤", "✂️", "🚿", "🧴", "🪜", "🧹", "📏", "🌡️",
      "💨", "🔥", "🧲", "🪛", "🔧", "🛒", "📦", "🪟", "🧵", "⚖️"
    ];

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

    function currentLocationId(eq) {
      const open = (eq.locationAssignments ?? []).find((a) => !a.to);
      return open?.locationId ?? null;
    }

    function tileVisual(eq) {
      if (eq.image) return { image: eq.image };
      return { icon: eq.icon || CATEGORY_EMOJI[eq.category] || "🧰" };
    }

    async function refresh() {
      const [equipment, locations, grows] = await Promise.all([
        storage.list("equipment"), storage.list("locations"), storage.list("grows")
      ]);
      cache = { equipment, locations, grows };
      renderGrid();
    }

    function fillCategoryFilter() {
      const filterSel = $("[data-equip-filter-category]");
      const cur = filterSel.value;
      filterSel.replaceChildren(new Option(t("common.all"), ""));
      for (const cat of CATEGORIES)
        filterSel.append(new Option(t("equipment.categories." + cat), cat));
      filterSel.value = cur;
    }

    // --- grid ---
    function renderGrid() {
      const grid = $("[data-equip-grid]");
      const emptyEl = $("[data-crud-empty]");
      grid.replaceChildren();

      let items = cache.equipment.slice().sort((a, b) => a.name.localeCompare(b.name));
      const filter = $("[data-equip-filter-category]").value;
      if (filter) items = items.filter((e) => e.category === filter);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        items = items.filter((e) =>
          [e.name, e.specs, e.notes].some((v) => String(v ?? "").toLowerCase().includes(q)));
      }
      emptyEl.hidden = cache.equipment.length > 0;
      emptyEl.textContent = searchTerm ? t("common.noSearchResults") : t("messages.noRecords");

      // + tile always first
      const add = document.createElement("button");
      add.type = "button";
      add.className = "equip-tile equip-tile--add";
      add.title = t("equipment.createTitle");
      const plus = document.createElement("span");
      plus.className = "equip-tile__plus";
      plus.textContent = "+";
      const addLabel = document.createElement("span");
      addLabel.className = "equip-tile__name";
      addLabel.textContent = t("equipment.addTile");
      add.append(plus, addLabel);
      add.addEventListener("click", () => openForm(null));
      grid.append(add);

      for (const eq of items) {
        const tile = document.createElement("div");
        tile.className = "equip-tile";
        tile.tabIndex = 0;
        const visual = document.createElement("div");
        visual.className = "equip-tile__visual";
        const vis = tileVisual(eq);
        if (vis.image) {
          const img = document.createElement("img");
          img.src = vis.image;
          img.alt = eq.name;
          img.loading = "lazy";
          visual.append(img);
        } else {
          visual.textContent = vis.icon;
        }
        const label = document.createElement("div");
        label.className = "equip-tile__label";
        label.textContent = eq.name;
        const meta = document.createElement("div");
        meta.className = "equip-tile__meta";
        const bits = [t("equipment.categories." + eq.category)];
        if (eq.availableEverywhere) bits.push(t("equipment.availableEverywhere"));
        else {
          const loc = currentLocationId(eq);
          if (loc) bits.push(locName(loc));
        }
        meta.textContent = bits.join(" · ");
        const gear = document.createElement("button");
        gear.type = "button";
        gear.className = "equip-tile__gear";
        gear.title = t("common.edit");
        gear.textContent = "⚙️";
        gear.addEventListener("click", (event) => {
          event.stopPropagation?.();
          openForm(eq);
        });
        tile.append(visual, label, meta, gear);
        tile.addEventListener("click", () => openForm(eq));
        grid.append(tile);
      }
    }

    // --- dialog ---
    function renderIconPreview() {
      const preview = $("[data-icon-preview]");
      preview.replaceChildren();
      if (iconState.image) {
        const img = document.createElement("img");
        img.src = iconState.image;
        img.alt = "icon";
        preview.append(img);
      } else if (iconState.icon) {
        preview.textContent = iconState.icon;
      } else {
        preview.textContent = "";
      }
    }

    function renderEmojiGrid() {
      const grid = $("[data-emoji-grid]");
      grid.replaceChildren();
      for (const emoji of EMOJI_CHOICES) {
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "equip-emoji";
        pick.textContent = emoji;
        pick.addEventListener("click", () => {
          iconState = { icon: emoji, image: null };
          renderIconPreview();
        });
        grid.append(pick);
      }
    }

    async function openForm(record = null) {
      const dialog = $("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      const errEl = dialog.querySelector("[data-crud-error]");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      form.dataset.editingId = record?.id ?? "";
      form.dataset.wasAssigned = record ? (currentLocationId(record) ?? "") : "";
      $("[data-crud-form-title]").textContent = record
        ? `${t("common.edit")}: ${record.name}` : t("equipment.createTitle");
      iconState = { icon: record?.icon ?? null, image: record?.image ?? null };
      if (!record) {
        // sensible default: the category emoji
        iconState = { icon: CATEGORY_EMOJI[$("#equip-category").value] ?? "🧰", image: null };
      }
      renderIconPreview();
      renderEmojiGrid();
      form.elements["name"].value = record?.name ?? "";
      $("#equip-category").value = record?.category ?? "other";
      $("#equip-status").value = record?.status ?? "stored";
      form.elements["specs"].value = record?.specs ?? "";
      window.LeafGuru.dateInput.set(form.elements["purchaseDate"], record?.purchaseDate ?? null);
      form.elements["cost"].value = record?.cost ?? "";
      $("#equip-currency").value = record?.currency ?? "EUR";
      $("#equip-grow").value = record?.growId
        ?? window.LeafGuru.growDomain.defaultGrowId(cache.grows) ?? "";
      $("#equip-everywhere").checked = record?.availableEverywhere ?? false;
      form.elements["notes"].value = record?.notes ?? "";
      // location assignment (moved into the dialog)
      const locSel = $("#equip-location");
      locSel.replaceChildren(new Option(t("plant.noLocation"), ""));
      for (const loc of cache.locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)))
        locSel.append(new Option(loc.name, loc.id));
      locSel.value = record ? (currentLocationId(record) ?? "") : "";
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
      record.purchaseDate = window.LeafGuru.dateInput.parse(form.elements["purchaseDate"]);
      const costRaw = form.elements["cost"].value;
      record.cost = costRaw === "" ? null : Number(costRaw);
      record.currency = $("#equip-currency").value.trim() || null;
      record.growId = $("#equip-grow").value || null;
      record.availableEverywhere = $("#equip-everywhere").checked;
      record.notes = form.elements["notes"].value.trim();
      // icon/image are mutually exclusive (schema contract)
      record.icon = iconState.icon;
      record.image = record.icon ? null : iconState.image;
      // location assignment change → close the old, open a new assignment
      const target = $("#equip-location").value || null;
      const previous = form.dataset.wasAssigned || "";
      if (editingId && target !== previous) {
        const now = new Date().toISOString();
        record.locationAssignments = record.locationAssignments ?? [];
        if (previous) {
          for (const a of record.locationAssignments) if (!a.to) a.to = now;
        }
        if (target) record.locationAssignments.push({ locationId: target, from: now, to: null });
      }
      try {
        await storage.put("equipment", record);
        $("[data-crud-dialog]").close();
        await refresh();
        flash(t("messages.saved"));
      } catch (e) {
        window.LeafGuru.ui.reportSubmitError(form, e);
      }
    }

    // --- image upload → data URL ---
    function wireIconUpload() {
      const input = $("[data-icon-file]");
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          flash(t("plant.photoUnsupported"), true);
          return;
        }
        if (file.size > 512 * 1024) {
          flash(t("equipment.iconTooBig"), true);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          iconState = { icon: null, image: String(reader.result) };
          renderIconPreview();
        };
        reader.readAsDataURL(file);
      });
      $("[data-icon-clear]").addEventListener("click", () => {
        iconState = { icon: null, image: null };
        renderIconPreview();
      });
      // picking a new image file clears a chosen emoji and vice versa
      $("[data-icon-preview]").addEventListener("click", () => {});
    }

    async function removeEq(eq) {
      if (!window.confirm(t("messages.confirmDelete", { name: eq.name }))) return;
      await storage.delete("equipment", eq.id);
      flash(t("messages.deleted"));
      await refresh();
    }

    // wire DOM
    $("[data-crud-dialog] form").addEventListener("submit", submitForm);
    $("[data-crud-search]").addEventListener("input", (event) => {
      searchTerm = event.target.value.trim();
      renderGrid();
    });
    $("[data-equip-filter-category]").addEventListener("change", () => renderGrid());
    wireIconUpload();

    await refresh();
  });
})();