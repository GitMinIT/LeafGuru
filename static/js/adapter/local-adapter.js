/**
 * LeafGuru — phase-1 storage: IndexedDB (photos + main object store).
 *
 * One database "leafguru" with an object store per entity. Photos store
 * Blobs; everything else plain objects. The full-state export reads all
 * stores and wraps them into the bundle shape of schemas/bundle.schema.json.
 */
(function () {
  "use strict";

  const DB_NAME = "leafguru";
  const DB_VERSION = 1;
  const ENTITIES = [
    "locations", "equipment", "strainTemplates", "plants",
    "stageLogs", "measurements", "locationChanges", "tasks", "photos"
  ];

  const ENTITIES_META = {
    locations: "location.schema.json",
    equipment: "equipment.schema.json",
    strainTemplates: "strain-template.schema.json",
    plants: "plant.schema.json",
    stageLogs: "stage-log.schema.json",
    measurements: "measurement.schema.json",
    locationChanges: "location-change.schema.json",
    tasks: "task.schema.json",
    photos: "photo.schema.json"
  };

  class LocalAdapter extends window.LeafGuru.StorageAdapter {
    constructor() {
      super();
      this._db = null;
    }

    /** @private */
    _open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          for (const name of ENTITIES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => reject(req.error);
      });
    }

    /** @private */
    async _tx(entity, mode, fn) {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(entity, mode);
        const store = tx.objectStore(entity);
        const result = fn(store);
        tx.oncomplete = () => resolve(result.result ?? result);
        tx.onerror = () => reject(tx.error);
      });
    }

    async list(entity) {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(entity).objectStore(entity).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async get(entity, id) {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(entity).objectStore(entity).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    }

    async put(entity, record) {
      if (!ENTITIES_META[entity]) throw new Error(`unknown entity: ${entity}`);
      if (!record.id) {
        record.id = window.LeafGuru.uuid();
        if (!record.createdAt) record.createdAt = new Date().toISOString();
      }
      record.updatedAt = new Date().toISOString();
      const check = window.LeafGuru.validator.validate(record, window.LeafGuru.schemas[ENTITIES_META[entity]]);
      if (!check.valid) throw new window.LeafGuru.LeafGuruValidationError(check.errors);
      await this._tx(entity, "readwrite", (s) => s.put(record));
      return record;
    }

    async delete(entity, id) {
      await this._tx(entity, "readwrite", (s) => s.delete(id));
    }

    async exportBundle() {
      const bundle = {
        meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: new Date().toISOString() }
      };
      for (const name of ENTITIES) {
        const records = await this.list(name);
        bundle[name] = name === "photos"
          ? await window.LeafGuru.photos.exportRecords(records)
          : records;
      }
      return bundle;
    }

    async importBundle(bundle) {
      const check = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
      if (!check.valid) throw new window.LeafGuru.LeafGuruValidationError(check.errors);
      await this.wipe();
      const db = await this._open();
      for (const name of ENTITIES) {
        const records = name === "photos"
          ? window.LeafGuru.photos.importRecords(bundle[name])
          : bundle[name] ?? [];
        if (!records.length) continue;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(name, "readwrite");
          const store = tx.objectStore(name);
          for (const rec of records) store.put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }

    async usage() {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return { bytes: est.usage ?? 0, quota: est.quota ?? 0 };
      }
      return { bytes: 0, quota: 0 };
    }

    async wipe() {
      const db = await this._open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(ENTITIES, "readwrite");
        for (const name of ENTITIES) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  window.LeafGuru.LocalAdapter = LocalAdapter;
  window.LeafGuru.LeafGuruValidationError = class LeafGuruValidationError extends Error {
    constructor(errors) {
      super(`validation failed (${errors.length} error${errors.length === 1 ? "" : "s"})`);
      this.name = "LeafGuruValidationError";
      this.errors = errors;
    }
  };
  window.LeafGuru.ENTITIES = ENTITIES;
  window.LeafGuru.ENTITIES_META = ENTITIES_META;
})();