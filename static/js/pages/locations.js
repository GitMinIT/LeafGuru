/**
 * LeafGuru — Locations page controller.
 * Schema-driven CRUD + detail dialog with cross-entity back-references
 * (equipment currently here, plants here, grows using this location).
 * Grow links are managed on the Grows page (grow.locationIds[]).
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const ld = window.LeafGuru.locationDomain;
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);
    const actionBtn = (label, fn, variant = "btn--ghost") => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = variant;
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    };

    async function openDetail(loc) {
      const [equipment, plants, grows] = await Promise.all([
        storage.list("equipment"), storage.list("plants"), storage.list("grows")
      ]);
      $("[data-loc-detail-name]").textContent = loc.name;
      const sizeParts = [];
      if (loc.size?.widthCm && loc.size?.depthCm)
        sizeParts.push(`${loc.size.widthCm}×${loc.size.depthCm} cm`);
      if (loc.size?.heightCm) sizeParts.push(`H ${loc.size.heightCm} cm`);
      if (loc.size?.areaM2) sizeParts.push(`${loc.size.areaM2} m²`);
      $("[data-loc-detail-meta]").textContent =
        `${t(loc.type === "indoor" ? "location.indoor" : "location.outdoor")}` +
        (sizeParts.length ? ` · ${sizeParts.join(" · ")}` : "") +
        ` · ${t(loc.active ? "common.active" : "common.inactive")}`;

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
      fill("[data-loc-detail-equipment]", ld.equipmentAt(equipment, loc.id), (e) =>
        `${e.name} — ${t("equipment.categories." + e.category)}` +
        (e.availableEverywhere ? ` · ${t("equipment.availableEverywhere")}` : ""));
      fill("[data-loc-detail-plants]", ld.plantsAt(plants, loc.id), (p) =>
        `${p.name} — ${t("stages." + p.stage)} · ${t("plant.status." + p.status)}`);
      fill("[data-loc-detail-grows]", ld.growsUsing(grows, loc.id), (g) =>
        `${g.name} (${t("grow.status." + g.status)})`);

      $("[data-location-detail]").showModal();
    }

    const page = new window.LeafGuru.CrudPage({
      entity: "locations",
      entityTitleKey: "location.title",
      searchable: true,
      searchPaths: ["name", "notes"],
      listColumns: [
        { path: "name" },
        { path: "type", format: (v) => t(v === "indoor" ? "location.indoor" : "location.outdoor") },
        { path: "size", format: (v) => {
            if (!v) return "–";
            const parts = [];
            if (v.widthCm && v.depthCm) parts.push(`${v.widthCm}×${v.depthCm} cm`);
            if (v.heightCm) parts.push(`H ${v.heightCm} cm`);
            if (v.areaM2) parts.push(`${v.areaM2} m²`);
            return parts.join(" · ") || "–";
          } },
        { path: "active", format: (v) => (v ? t("common.active") : t("common.inactive")) },
        { path: "notes" }
      ],
      rowActions: (rec) => [actionBtn(t("location.detail"), () => openDetail(rec))],
      fields: [
        { path: "name", label: "common.name", type: "string", required: true },
        { path: "type", label: "location.indoor", type: "string" }, // select via DOM patch
        { path: "size.widthCm", label: "location.width", type: "number" },
        { path: "size.depthCm", label: "location.depth", type: "number" },
        { path: "size.heightCm", label: "location.height", type: "number" },
        { path: "size.areaM2", label: "location.area", type: "number" },
        { path: "notes", label: "common.notes", type: "string" },
        { path: "active", label: "common.active", type: "boolean", default: true }
      ]
    });

    await page.mount();

    // type field is an enum — replace the auto text input AFTER mount()
    // has created the inputs (mount is synchronous)
    const form = document.querySelector("[data-crud-dialog] form");
    const typeLabel = form.querySelector('input[name="type"]').closest("label");
    const select = document.createElement("select");
    select.name = "type";
    for (const [value, key] of [["indoor", "location.indoor"], ["outdoor", "location.outdoor"]]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = t(key);
      select.append(opt);
    }
    typeLabel.querySelector("input").replaceWith(select);
    form.elements.type.closest("label").querySelector("select").value = "indoor";

    // keep the type-select value in sync when editing a record
    const origOpenForm = page.openForm.bind(page);
    page.openForm = (record = null) => {
      origOpenForm(record);
      form.elements.type.closest("label").querySelector("select").value =
        record?.type ?? "indoor";
    };

    $("[data-loc-detail-close]").addEventListener("click", () =>
      $("[data-location-detail]").close());
  });
})();