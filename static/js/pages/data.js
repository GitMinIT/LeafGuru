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
        if (result.imported) await showUsage();
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
    });
  });
})();