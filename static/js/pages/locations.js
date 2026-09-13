/**
 * LeafGuru — Locations page controller.
 * Schema-driven CRUD; list columns and form fields mirror
 * schemas/location.schema.json. Grow link via CrudPage dynamic field.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k) => window.LeafGuru.i18n.t(k);
    let grows = [];

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
        { path: "growId", format: (v) => (v ? grows.find((g) => g.id === v)?.name ?? "–" : "–") },
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
        { path: "growId", label: "nav.grows", type: "string", dynamic: "growId" },
        { path: "notes", label: "common.notes", type: "string" },
        { path: "active", label: "common.active", type: "boolean", default: true }
      ]
    });

    // patch: track grows for the list column + dynamic select
    const origRefresh = page.refresh.bind(page);
    page.refresh = async function () {
      grows = await window.LeafGuru.storage.list("grows");
      await origRefresh();
    };

    // grow selector (dynamic field): label + select live in the dialog
    const form = document.querySelector("[data-crud-dialog] form");
    const growLabel = document.createElement("label");
    growLabel.textContent = t("nav.grows");
    const growSel = document.createElement("select");
    growSel.dataset.dynamic = "growId";
    growLabel.append(growSel);
    form.querySelector(".crud-fields").append(growLabel);

    await page.mount();

    // grow selector options refreshed on every openForm (dynamic field)
    const growSelect = form.querySelector('select[data-dynamic="growId"]');
    const origOpenForm = page.openForm.bind(page);
    page.openForm = async (record = null) => {
      grows = await window.LeafGuru.storage.list("grows");
      origOpenForm(record);
      growSelect.replaceChildren(new Option(t("common.none"), ""));
      for (const g of grows.slice().sort((a, b) => a.name.localeCompare(b.name)))
        growSelect.append(new Option(g.name, g.id));
      growSelect.value = record?.growId ?? "";
    };

    // type field is an enum — replace the auto text input AFTER mount()
    // has created the inputs (mount is synchronous)
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
  });
})();