/**
 * LeafGuru — photo storage (phase 1: IndexedDB Blobs).
 *
 * Photos are stored in the "photos" object store as { blob: File/Blob }.
 * For export, blobs are serialized to base64 data URLs and stripped on
 * import (converted back). Everything validated against the photo schema.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const MAX_BYTES = 10 * 1024 * 1024;
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(",");
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  window.LeafGuru.photos = {
    MAX_BYTES,
    ALLOWED,

    /** validate + build a photo record (blob kept as-is for IndexedDB) */
    buildRecord({ plant, file, note = "", phaseTag = null, at = null }) {
      if (!ALLOWED.includes(file.type)) {
        throw new Error(window.LeafGuru.i18n.t("plant.photoUnsupported"));
      }
      if (file.size > MAX_BYTES) {
        throw new Error(window.LeafGuru.i18n.t("plant.photoTooBig"));
      }
      const now = at ?? new Date().toISOString();
      return {
        id: window.LeafGuru.uuid(),
        plantId: plant.id,
        blob: file,
        mimeType: file.type,
        takenAt: now,
        note,
        phaseTag,
        createdAt: now,
        updatedAt: now
      };
    },

    /** object URL for display (caller must revoke) */
    async urlFor(record) {
      const blob = record.blob instanceof Blob ? record.blob : dataUrlToBlob(record.blob);
      return URL.createObjectURL(blob);
    },

    /** export: serialize photos with base64 data URLs.
     * Strings are already data URLs — passed through unchanged (idempotent). */
    async exportRecords(records) {
      const out = [];
      for (const rec of records) {
        if (typeof rec.blob === "string") { out.push({ ...rec }); continue; }
        out.push({ ...rec, blob: await blobToDataUrl(rec.blob) });
      }
      return out;
    },

    /** import: convert data URLs back to Blobs */
    importRecords(records) {
      return (records ?? []).map((rec) =>
        typeof rec.blob === "string" ? { ...rec, blob: dataUrlToBlob(rec.blob) } : rec);
    }
  };
})();