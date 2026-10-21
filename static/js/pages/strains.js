/**
 * LeafGuru — Strains page controller.
 * A strain is a plant VARIETY (category), not a plant: name/breeder/
 * genotype describe the variety; stage durations and height are typical
 * expectations used for plant stage countdowns. Schema-driven CRUD via
 * CrudPage.
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
        { path: "expectedHeightCm", format: (v) => (v != null ? `~${v} cm` : "–") },
        { path: "stageDurations", format: (v) => {
            if (!v) return "–";
            const parts = [];
            for (const [stage, days] of Object.entries(v))
              if (days != null) parts.push(`${t("stages." + stage)} ${days}d`);
            return parts.join(" · ") || "–";
          } },
        { path: "characteristics" }
      ],
      fields: [
        // identity — what the variety is
        { path: "name", label: "strain.name", type: "string", required: true },
        { path: "breeder", label: "strain.breeder", type: "string" },
        { path: "genotype", label: "strain.genotype", type: "string" }, // select via DOM patch
        // expectations — typical values for this variety
        { path: "stageDurations.seedling", label: "strain.durationSeedling", type: "number" },
        { path: "stageDurations.vegetative", label: "strain.durationVegetative", type: "number" },
        { path: "stageDurations.flowering", label: "strain.durationFlowering", type: "number" },
        { path: "expectedHeightCm", label: "strain.expectedHeight", type: "number" },
        { path: "characteristics", label: "strain.characteristics", type: "string" },
        { path: "notes", label: "common.notes", type: "string" }
      ]
    });

    await page.mount();

    // genotype is an enum — replace the auto text input with a select (after mount)
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
      else select.value = record.genotype ?? "unknown";
    };

    // The catalog picker opens the create dialog prefilled from a catalog
    // entry (see static/js/pages/strains-catalog.js).
    const origOpenDraft = page.openDraft.bind(page);
    page.openDraft = (draft) => {
      origOpenDraft(draft);
      select.value = draft?.genotype ?? "unknown";
    };

    // exposed for the catalog picker
    window.LeafGuru.strainsPage = page;
  });
})();