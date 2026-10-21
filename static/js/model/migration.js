/**
 * LeafGuru — one-time local → server migration.
 *
 * When the app finds data in the browser AND an (empty) server, it stays
 * local and offers this: the user's data moves to the server once, then
 * the app switches to server mode. Nothing is deleted from the browser
 * until the import succeeded — if anything goes wrong, the data is
 * still there.
 *
 * The import is idempotent: the same record ids are re-imported, so
 * running it twice does not duplicate anything (the server replaces the
 * workspace contents with the bundle it is given).
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * Copy the local data of a profile into the server.
   *
   * @param {object} options
   *   profileId  which local profile to export (default: the active one)
   *   workspaceId the server workspace to import into
   * @returns {object} counts per entity
   */
  async function migrateToServer({ profileId, workspaceId, onProgress } = {}) {
    const local = new window.LeafGuru.LocalAdapter({
      profileId: profileId ?? window.LeafGuru.profiles.activeId(),
    });
    const server = new window.LeafGuru.ServerAdapter();

    onProgress?.("Exporting the local data…");
    const bundle = await local.exportBundle();

    // photos carry their bytes as base64 data URLs; the server stores
    // them as files, so they are uploaded one by one
    const photos = bundle.photos ?? [];
    const withoutPhotos = { ...bundle, photos: [] };

    onProgress?.(`Uploading ${photos.length} photo(s)…`);
    for (const photo of photos) {
      if (!photo.blob) continue;
      try {
        const dataUrl = photo.blob;
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const form = new FormData();
        form.append("file", blob, "photo");
        const meta = { ...photo };
        delete meta.blob;
        form.append("payload",
          new Blob([JSON.stringify(meta)], { type: "application/json" }));
        await fetch("/api/v1/photos/", {
          method: "POST",
          credentials: "same-origin",
          body: form,
          headers: { "X-CSRFToken": window.LeafGuru.serverCsrfToken?.() ?? "" },
        });
      } catch {
        // a photo that fails to upload must not abort the whole import
      }
    }

    onProgress?.("Importing the records…");
    await server.importBundle(withoutPhotos);

    const counts = {};
    for (const [key, value] of Object.entries(bundle)) {
      if (key === "meta") continue;
      if (Array.isArray(value)) counts[key] = value.length;
    }
    return counts;
  }

  /**
   * Check whether there is anything to migrate.
   * @returns {Promise<{local:boolean, server:boolean, counts:object}>}
   */
  async function inspect() {
    const local = new window.LeafGuru.LocalAdapter();
    const counts = {};
    let hasLocal = false;
    for (const entity of ["plants", "grows", "locations", "equipment",
      "strainTemplates", "tasks", "logEntries", "stageLogs", "measurements",
      "locationChanges", "photos"]) {
      const records = await local.list(entity);
      counts[entity] = records.length;
      if (records.length) hasLocal = true;
    }

    let hasServer = false;
    try {
      const res = await fetch("/api/v1/bundle/", {
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const bundle = await res.json();
        for (const [key, value] of Object.entries(bundle)) {
          if (key === "meta") continue;
          if (Array.isArray(value) && value.length) { hasServer = true; break; }
        }
      }
    } catch { /* no server */ }

    return { local: hasLocal, server: hasServer, counts };
  }

  window.LeafGuru.migration = { migrateToServer, inspect };
})();
