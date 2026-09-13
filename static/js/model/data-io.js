/**
 * LeafGuru — export/import logic (phase 1: browser side).
 *
 * Export: reads the full state from the adapter, serializes to a
 * versioned, schema-validated JSON file download.
 * Import: reads a JSON file, validates against the bundle schema,
 * asks for confirmation, replaces local data.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  window.LeafGuru.dataIO = {
    async exportToFile() {
      const bundle = await window.LeafGuru.storage.exportBundle();
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leafguru-export-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return bundle;
    },

    /** read + validate + confirm; returns true if imported */
    async importFromFile(file, { confirmFn } = {}) {
      const text = await file.text();
      let bundle;
      try {
        bundle = JSON.parse(text);
      } catch (e) {
        throw new Error(`not valid JSON: ${e.message}`);
      }
      const check = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
      if (!check.valid) {
        const first = check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ");
        throw new Error(`schema validation failed — ${first}${check.errors.length > 3 ? " …" : ""}`);
      }
      const counts = Object.entries(bundle)
        .filter(([k, v]) => Array.isArray(v))
        .map(([k, v]) => `${k}: ${v.length}`)
        .join(", ");
      const confirmed = confirmFn
        ? await confirmFn(counts)
        : window.confirm(`Replace all current data with the imported file?\n\n${counts}`);
      if (!confirmed) return { imported: false };
      await window.LeafGuru.storage.importBundle(bundle);
      return { imported: true, counts };
    },

    formatBytes(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
      return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
    }
  };
})();