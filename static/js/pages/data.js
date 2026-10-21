/**
 * LeafGuru — Data page controller: export, import, usage, wipe.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = await window.LeafGuru.createStorage();

    const $ = (sel) => document.querySelector(sel);
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);

    // A demo load may reload the page (the demo lives in its own
    // profile). The confirmation is parked here so it survives the
    // reload instead of vanishing with the old page.
    const DEMO_STATUS_KEY = "leafguru.demoStatus";
    try {
      const parked = sessionStorage.getItem(DEMO_STATUS_KEY);
      if (parked) {
        sessionStorage.removeItem(DEMO_STATUS_KEY);
        const el = $("[data-demo-status]");
        if (el) el.textContent = parked;
      }
    } catch { /* no session storage */ }

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
        tasks: "nav.tasks", logEntries: "log.title",
        sensorReadings: "sensor.title", photos: "plant.photos"
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
    // The demo lives in its OWN profile ("Demo"), so it can never overwrite
    // real data. The app switches to the demo profile afterwards.
    $("[data-action='demo']").addEventListener("click", async () => {
      const status = $("[data-demo-status]");
      if (!window.confirm(t("data.demoGrowConfirm"))) return;
      try {
        const { bundle, profile, switched } =
          await window.LeafGuru.demoData.seedDemoProfile({ switchTo: true });
        const total = Object.values(bundle).reduce(
          (n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
        status.textContent = t("data.demoGrowLoaded")
          + ` (${total} records, profile "${profile.name}")`;
        await showUsage();
        await showCounts();
        if (switched) {
          // the demo lives in its own profile — jump into it. Park the
          // confirmation first so it is still there after the reload.
          try { sessionStorage.setItem(DEMO_STATUS_KEY, status.textContent); } catch { /* no session storage */ }
          location.reload();
        }
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

    // --- where the data lives ------------------------------------------
    const modeHint = $("[data-storage-mode-hint]");
    const modeStatus = $("[data-storage-status]");
    const useLocal = $("[data-action='use-local']");
    const useServer = $("[data-action='use-server']");
    const migrateBtn = $("[data-action='migrate']");
    const serverAvailable = !!window.LeafGuru.serverStatus?.server;

    async function showStorageMode() {
      if (!modeHint) return;
      const mode = window.LeafGuru.storageMode
        ?? (window.LeafGuru.isServerMode?.() ? "server" : "local");
      if (!serverAvailable) {
        modeHint.textContent = t("data.storageNoServerHint");
        if (useLocal) useLocal.disabled = true;
        if (useServer) useServer.disabled = true;
        if (migrateBtn) migrateBtn.disabled = true;
        return;
      }
      modeHint.textContent = t(mode === "server"
        ? "data.storageServerHint" : "data.storageLocalHint");
      if (useLocal) useLocal.disabled = mode === "local";
      if (useServer) useServer.disabled = mode === "server";
      if (migrateBtn) {
        migrateBtn.disabled = mode === "server";
        migrateBtn.hidden = mode === "server";
      }
    }
    await showStorageMode();

    if (useLocal) {
      useLocal.addEventListener("click", () => {
        window.LeafGuru.setStorageMode("local");
      });
    }
    if (useServer) {
      useServer.addEventListener("click", () => {
        if (!window.confirm(t("data.useServerConfirm"))) return;
        window.LeafGuru.setStorageMode("server");
      });
    }
    if (migrateBtn) {
      migrateBtn.addEventListener("click", async () => {
        const status = modeStatus;
        const ok = window.confirm(t("data.migrateConfirm"));
        if (!ok) return;
        try {
          status.textContent = t("data.migrating");
          const counts = await window.LeafGuru.migration.migrateToServer({
            onProgress: (msg) => { status.textContent = msg; },
          });
          const total = Object.values(counts).reduce((n, v) => n + v, 0);
          status.textContent = t("data.migrated", { count: total });
          if (window.confirm(t("data.useServerNow"))) {
            window.LeafGuru.setStorageMode("server");
          }
        } catch (e) {
          status.textContent = e.message;
        }
      });
    }

    $("[data-action='wipe']").addEventListener("click", async () => {
      const status = $("[data-wipe-status]");
      const profile = window.LeafGuru.profiles?.active?.();
      const label = profile ? `${t("data.wipeAll")} ("${profile.name}")` : t("data.wipeAll");
      if (!window.confirm(label + "? " + t("messages.confirmDelete", { name: profile?.name ?? "ALL" }))) return;
      await window.LeafGuru.storage.wipe();
      status.textContent = t("messages.deleted");
      await showUsage();
      await showCounts();
    });
  });
})();