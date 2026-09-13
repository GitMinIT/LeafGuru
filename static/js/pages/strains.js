/**
 * LeafGuru — Strain Templates page controller.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    const t = (k) => window.LeafGuru.i18n.t(k);

    const page = new window.LeafGuru.CrudPage({
      entity: "strainTemplates",
      entityTitleKey: "strain.title",
      listColumns: [
        { path: "name" },
        { path: "breeder", format: (v) => v ?? "–" },
        { path: "genotype", format: (v) => t("strain.genotypes." + v) },
        { path: "expectedHeightCm", format: (v) => (v != null ? `${v} cm` : "–") },
        { path: "characteristics" }
      ],
      fields: [
        { path: "name", label: "strain.name", type: "string", required: true },
        { path: "breeder", label: "strain.breeder", type: "string" },
        { path: "genotype", label: "strain.genotype", type: "string" },
        { path: "expectedHeightCm", label: "strain.expectedHeight", type: "number" },
        { path: "stageDurations.seedling", label: "strain.stageDurations", type: "number" },
        { path: "stageDurations.vegetative", label: "strain.stageDurations", type: "number" },
        { path: "stageDurations.flowering", label: "strain.stageDurations", type: "number" },
        { path: "characteristics", label: "strain.characteristics", type: "string" },
        { path: "notes", label: "common.notes", type: "string" }
      ]
    });

    const form = document.querySelector("[data-crud-dialog] form");
    const label = form.querySelector('input[name="genotype"]').closest("label");
    const select = document.createElement("select");
    select.name = "genotype";
    for (const [value, key] of Object.entries({ indica: "strain.genotypes.indica", sativa: "strain.genotypes.sativa", hybrid: "strain.genotypes.hybrid", unknown: "strain.genotypes.unknown" })) {
      select.append(new Option(t(key), value));
    }
    label.querySelector("input").replaceWith(select);
    const origOpenForm = page.openForm.bind(page);
    page.openForm = (record = null) => {
      origOpenForm(record);
      if (!record) select.value = "unknown";
    };

    await page.mount();
  });
})();