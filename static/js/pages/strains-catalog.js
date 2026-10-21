/**
 * LeafGuru — strain catalog picker (Strains page).
 *
 * A search box + result list that lets the user pick a well-known strain
 * instead of typing it in by hand. Picking an entry fills the create
 * dialog with the catalog's breeder, genotype, typical stage durations
 * and expected height — the user can still adjust everything before
 * saving.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = await window.LeafGuru.createStorage();
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);

    const searchInput = $("[data-catalog-search]");
    const resultsEl = $("[data-catalog-results]");
    const statusEl = $("[data-catalog-status]");
    const panel = $("[data-catalog-panel]");

    if (!searchInput || !resultsEl) return;

    let entries = [];
    let loadFailed = false;

    /** render the result list */
    function render(list) {
      resultsEl.replaceChildren();
      if (!list.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = t("strain.catalogEmpty");
        resultsEl.append(p);
        return;
      }
      for (const entry of list) {
        const row = document.createElement("li");
        row.className = "catalog-row";

        const main = document.createElement("div");
        main.className = "catalog-row__main";

        const name = document.createElement("span");
        name.className = "catalog-row__name";
        name.textContent = entry.name;

        const meta = document.createElement("span");
        meta.className = "catalog-row__meta muted";
        const bits = [];
        if (entry.breeder) bits.push(entry.breeder);
        bits.push(t("strain.genotypes." + (entry.genotype ?? "unknown")));
        if (entry.thc != null) bits.push(`THC ${entry.thc}%`);
        if (entry.cbd != null) bits.push(`CBD ${entry.cbd}%`);
        meta.textContent = bits.join(" · ");

        main.append(name, meta);

        const use = document.createElement("button");
        use.type = "button";
        use.className = "btn--ghost";
        use.textContent = t("strain.catalogUse");
        use.addEventListener("click", () => useEntry(entry));

        row.append(main, use);
        resultsEl.append(row);
      }
    }

    /** load the catalog once */
    async function ensureCatalog() {
      if (entries.length || loadFailed) return;
      statusEl.textContent = t("strain.catalogLoading");
      try {
        entries = await window.LeafGuru.strainCatalog.load();
        statusEl.textContent = "";
      } catch (e) {
        loadFailed = true;
        statusEl.textContent = t("strain.catalogUnavailable");
        return;
      }
    }

    /** open the create dialog prefilled with the picked catalog entry */
    function useEntry(entry) {
      const tpl = window.LeafGuru.strainCatalog.toTemplate(entry);
      const page = window.LeafGuru.strainsPage;
      if (!page?.openDraft) {
        statusEl.textContent = t("strain.catalogUnavailable");
        return;
      }
      // openDraft() fills every field and opens the dialog; the Strains
      // page overrides it to also apply the genotype select.
      page.openDraft(tpl);
    }

    // --- wiring ---------------------------------------------------------
    let timer = null;
    searchInput.addEventListener("input", async () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      timer = setTimeout(async () => {
        await ensureCatalog();
        if (loadFailed) return;
        const list = await window.LeafGuru.strainCatalog.search(q, 40);
        render(list);
      }, 140);
    });

    // show the popular set right away
    ensureCatalog().then(async () => {
      if (loadFailed) return;
      const list = await window.LeafGuru.strainCatalog.search("", 24);
      render(list);
    });

    // toggle the panel
    const toggle = $("[data-catalog-toggle]");
    if (toggle) {
      toggle.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) searchInput.focus();
      });
    }
  });
})();
