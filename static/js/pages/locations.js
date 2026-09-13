/**
 * LeafGuru — Locations page controller.
 * Schema-driven CRUD; list columns and form fields mirror
 * schemas/location.schema.json.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k) => window.LeafGuru.i18n.t(k);

    const page = new window.LeafGuru.CrudPage({
      entity: "locations",
      entityTitleKey: "location.title",
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

    // type field is an enum — replace the auto text input with a select
    const dialog = document.querySelector("[data-crud-dialog]");
    const form = dialog.querySelector("form");
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

    // CrudPage._fillField/submit use form.elements — select is there too;
    // but openForm default for type must be "indoor"
    form.elements.type.closest("label").querySelector("select").value = "indoor";

    await page.mount();
  });
})();