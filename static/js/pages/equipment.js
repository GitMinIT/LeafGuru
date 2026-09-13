/**
 * LeafGuru — Equipment page controller.
 * Schema-driven CRUD via CrudPage; category as select; location assignments
 * shown as plain list for now (assignment editor comes with plant detail
 * reuse); specs/cost fields per schema.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    const t = (k) => window.LeafGuru.i18n.t(k);

    const page = new window.LeafGuru.CrudPage({
      entity: "equipment",
      entityTitleKey: "equipment.title",
      listColumns: [
        { path: "name" },
        { path: "category", format: (v) => t("equipment.categories." + v) },
        { path: "status", format: (v) => t("equipment.status." + v) },
        { path: "cost", format: (v) => (v != null ? v : "–") },
        { path: "purchaseDate", format: (v) => v ?? "–" },
        { path: "notes" }
      ],
      fields: [
        { path: "name", label: "common.name", type: "string", required: true },
        { path: "category", label: "equipment.categories.light", type: "string" },
        { path: "specs", label: "common.notes", type: "string" },
        { path: "purchaseDate", label: "common.date", type: "string", format: "date" },
        { path: "cost", label: "common.actions", type: "number" },
        { path: "status", label: "equipment.status.in-use", type: "string" },
        { path: "notes", label: "common.notes", type: "string" }
      ]
    });

    // category + status are enums — replace the auto inputs with selects
    const form = document.querySelector("[data-crud-dialog] form");
    const makeSelect = (inputName, options) => {
      const label = form.querySelector(`input[name="${inputName}"]`).closest("label");
      const select = document.createElement("select");
      select.name = inputName;
      for (const [value, key] of options) select.append(new Option(t(key), value));
      label.querySelector("input").replaceWith(select);
      return select;
    };
    const catSelect = makeSelect("category",
      Object.entries({ light: "equipment.categories.light", pot: "equipment.categories.pot", soil: "equipment.categories.soil", fan: "equipment.categories.fan", filter: "equipment.categories.filter", nutrient: "equipment.categories.nutrient", sensor: "equipment.categories.sensor", other: "equipment.categories.other" }));
    const statusSelect = makeSelect("status",
      Object.entries({ "in-use": "equipment.status.in-use", stored: "equipment.status.stored", broken: "equipment.status.broken", sold: "equipment.status.sold" }));

    // CrudPage._fillField uses form.elements — selects are included. But the
    // generic submit maps checkbox/number/text only; select values pass as
    // text — fine. Patch defaults: category=other, status=stored
    const origOpenForm = page.openForm.bind(page);
    page.openForm = (record = null) => {
      origOpenForm(record);
      if (!record) {
        catSelect.value = "other";
        statusSelect.value = "stored";
      }
    };

    await page.mount();
  });
})();