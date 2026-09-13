/**
 * LeafGuru — storage adapter interface.
 *
 * Both storage backends (browser-local in phase 1, REST API in phase 2)
 * implement this interface. Callers never talk to IndexedDB or fetch()
 * directly; they use `LeafGuru.storage`.
 *
 * Data shapes are defined by schemas/*.schema.json (single source of truth).
 */
(function () {
  "use strict";

  /**
   * @interface
   * All list methods return Promise<Array<entity>>.
   * All mutating methods return Promise<Entity> (persisted record).
   */
  class StorageAdapter {
    /** @returns Promise<Bundle> full state (meta + entity arrays), used by export */
    async exportBundle() { throw new Error("not implemented"); }
    /** @param bundle — full state; replaces all data after validation */
    async importBundle() { throw new Error("not implemented"); }
    /** @returns Promise<{bytes:number}> approximate storage usage */
    async usage() { throw new Error("not implemented"); }
    /** wipe everything (danger zone) */
    async wipe() { throw new Error("not implemented"); }

    // Generic CRUD per entity type. entityName ∈ {
    //   locations, equipment, strainTemplates, plants,
    //   stageLogs, measurements, locationChanges, tasks, photos }
    async list(entity) { throw new Error("not implemented"); }
    async get(entity, id) { throw new Error("not implemented"); }
    async put(entity, record) { throw new Error("not implemented"); }
    async delete(entity, id) { throw new Error("not implemented"); }
  }

  window.LeafGuru = window.LeafGuru || {};
  window.LeafGuru.StorageAdapter = StorageAdapter;
})();