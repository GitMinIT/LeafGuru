/**
 * LeafGuru — Data page controller: export, import, usage, wipe.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const $ = (sel) => document.querySelector(sel);
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);

    const fmtBytes = window.LeafGuru.dataIO.formatBytes;
    const usageEl = $("[data-storage-usage]");
    async function showUsage() {
      const u = await window.LeafGuru.storage.usage();
      usageEl.textContent = fmtBytes(u.bytes) + (u.quota ? ` of ${fmtBytes(u.quota)}` : "");
    }
    await showUsage();

    // record counts per entity
    async function showCounts() {
      const ul = $("[data-record-counts]");
      ul.replaceChildren();
      const ENTITY_LABELS = {
        grows: "nav.grows", locations: "nav.locations", equipment: "nav.equipment",
        strainTemplates: "nav.strains", plants: "nav.plants", stageLogs: "plant.stageHistory",
        measurements: "plant.measurements", locationChanges: "plant.locationHistory",
        tasks: "nav.tasks", logEntries: "log.title", photos: "plant.photos"
      };
      for (const [entity, key] of Object.entries(ENTITY_LABELS)) {
        const records = await window.LeafGuru.storage.list(entity);
        const li = document.createElement("li");
        li.textContent = `${t(key)}: ${records.length}`;
        ul.append(li);
      }
    }
    await showCounts();

    // --- demo grow -----------------------------------------------------
    $("[data-action='demo']").addEventListener("click", async () => {
      const status = $("[data-demo-status]");
      if (!window.confirm(t("data.demoGrowConfirm"))) return;
      try {
        const bundle = await window.LeafGuru.demoData.seedDemoGrow(window.LeafGuru.storage);
        const total = Object.values(bundle).reduce(
          (n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
        status.textContent = t("data.demoGrowLoaded") + ` (${total} records)`;
        await showUsage();
        await showCounts();
      } catch (e) {
        status.textContent = e.message;
      }
    });

    $("[data-action='export']").addEventListener("click", async () => {
      const status = $("[data-export-status]");
      try {
        const bundle = await window.LeafGuru.dataIO.exportToFile();
        const total = Object.values(bundle).reduce(
          (n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
        status.textContent = t("messages.exported") + ` (${total} records)`;
        await showUsage();
      } catch (e) {
        status.textContent = e.message;
      }
    });

    $("[data-action='import']").addEventListener("click", () => {
      const input = $("[data-import-input]");
      input.value = "";
      input.click();
    });
    $("[data-import-input]").addEventListener("change", async (event) => {
      const status = $("[data-import-status]");
      const file = event.target.files[0];
      if (!file) return;
      try {
        const result = await window.LeafGuru.dataIO.importFromFile(file);
        status.textContent = result.imported ? t("messages.imported") : t("common.cancel");
        if (result.imported) { await showUsage(); await showCounts(); }
      } catch (e) {
        status.textContent = t("messages.importFailed", { reason: e.message });
      }
    });

    $("[data-action='wipe']").addEventListener("click", async () => {
      const status = $("[data-wipe-status]");
      if (!window.confirm(t("data.wipeAll") + "? " + t("messages.confirmDelete", { name: "ALL" }))) return;
      await window.LeafGuru.storage.wipe();
      status.textContent = t("messages.deleted");
      await showUsage();
      await showCounts();
    });
  });
})();