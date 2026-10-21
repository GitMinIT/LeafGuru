/**
 * LeafGuru — profile store.
 *
 * A profile is an independent data set inside the same browser: its own
 * IndexedDB database, its own plants, tasks and journal. The default
 * profile holds the data that was already there; other profiles (e.g.
 * "Demo", "2026 season") are fully isolated from it.
 *
 * Profiles are the local stand-in for the per-user isolation of the
 * hosted version: the same idea, one level down. The active profile id
 * is what the storage adapter uses to pick its database.
 *
 * Stored in localStorage (like the UI settings) — the DATA lives in
 * IndexedDB, one database per profile.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const KEY_PROFILES = "leafguru.profiles";
  const KEY_ACTIVE = "leafguru.activeProfile";

  const DEFAULT_ID = "default";
  const DEMO_ID = "demo";

  function readProfiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_PROFILES) ?? "[]");
      if (!Array.isArray(raw)) throw new Error("not an array");
      const list = raw.filter((p) => p && typeof p.id === "string" && typeof p.name === "string");
      // the default profile always exists
      if (!list.some((p) => p.id === DEFAULT_ID)) {
        list.unshift({ id: DEFAULT_ID, name: "Default", createdAt: new Date().toISOString() });
      }
      return list;
    } catch {
      return [{ id: DEFAULT_ID, name: "Default", createdAt: new Date().toISOString() }];
    }
  }

  function writeProfiles(list) {
    localStorage.setItem(KEY_PROFILES, JSON.stringify(list));
    notifyChanged();
  }

  /** tell the UI that the profile list changed */
  function notifyChanged() {
    try {
      window.dispatchEvent(new CustomEvent("leafguru:profiles-changed"));
    } catch { /* no DOM (tests) */ }
  }

  function readActive() {
    const id = localStorage.getItem(KEY_ACTIVE);
    const list = readProfiles();
    return list.some((p) => p.id === id) ? id : DEFAULT_ID;
  }

  window.LeafGuru.profiles = {
    DEFAULT_ID,
    DEMO_ID,

    /** all profiles, default first */
    list() {
      const list = readProfiles();
      return [...list].sort((a, b) =>
        (a.id === DEFAULT_ID ? -1 : b.id === DEFAULT_ID ? 1 : a.createdAt.localeCompare(b.createdAt)));
    },

    /** the active profile id */
    activeId() { return readActive(); },

    /** the active profile record */
    active() {
      const id = readActive();
      return readProfiles().find((p) => p.id === id) ?? { id: DEFAULT_ID, name: "Default" };
    },

    get(id) { return readProfiles().find((p) => p.id === id) ?? null; },

    /**
     * Create a profile. Ids are derived from the name so the same name
     * always maps to the same profile (and thus the same database).
     */
    create(name, { id } = {}) {
      const clean = String(name ?? "").trim();
      if (!clean) throw new Error("profile name is required");
      const list = readProfiles();
      const profileId = id ?? slugify(clean);
      if (list.some((p) => p.id === profileId)) return list.find((p) => p.id === profileId);
      const profile = { id: profileId, name: clean, createdAt: new Date().toISOString() };
      list.push(profile);
      writeProfiles(list);
      return profile;
    },

    /** create the profile if it does not exist yet, then return it */
    ensure(name, { id } = {}) {
      const list = readProfiles();
      const profileId = id ?? slugify(String(name));
      const found = list.find((p) => p.id === profileId);
      if (found) return found;
      return this.create(name, { id: profileId });
    },

    rename(id, name) {
      const clean = String(name ?? "").trim();
      if (!clean) throw new Error("profile name is required");
      const list = readProfiles();
      const profile = list.find((p) => p.id === id);
      if (!profile) throw new Error(`unknown profile: ${id}`);
      profile.name = clean;
      writeProfiles(list);
      return profile;
    },

    /** remove a profile (the default one cannot be removed) */
    remove(id) {
      if (id === DEFAULT_ID) throw new Error("the default profile cannot be removed");
      const list = readProfiles().filter((p) => p.id !== id);
      writeProfiles(list);
      if (readActive() === id) localStorage.setItem(KEY_ACTIVE, DEFAULT_ID);
      return list;
    },

    /** switch the active profile — the caller reloads the page */
    setActive(id) {
      const list = readProfiles();
      if (!list.some((p) => p.id === id)) throw new Error(`unknown profile: ${id}`);
      localStorage.setItem(KEY_ACTIVE, id);
      notifyChanged();
      return list.find((p) => p.id === id);
    },

    /**
     * Copy a profile's data into a NEW profile.
     *
     * The copy goes through the normal export/import path, so photos come
     * along and the result is a full, valid data set — not a shallow
     * pointer. The source profile is left untouched.
     *
     * @param {string} sourceId profile to copy from
     * @param {string} name name of the new profile
     * @returns the new profile record
     */
    async duplicate(sourceId, name) {
      const source = this.get(sourceId);
      if (!source) throw new Error(`unknown profile: ${sourceId}`);
      const clean = String(name ?? "").trim();
      if (!clean) throw new Error("profile name is required");

      // a fresh id that cannot collide with an existing profile
      let base = slugify(clean);
      let id = base;
      let n = 2;
      while (readProfiles().some((p) => p.id === id)) id = `${base}-${n++}`;

      const created = this.create(clean, { id });

      // copy the data: export from the source profile, import into the new one
      const sourceAdapter = new window.LeafGuru.LocalAdapter({ profileId: sourceId });
      const targetAdapter = new window.LeafGuru.LocalAdapter({ profileId: id });
      const bundle = await sourceAdapter.exportBundle();
      await targetAdapter.importBundle(bundle);
      return created;
    },

    /**
     * Remove every trace of a profile from the browser: the profile entry
     * AND its IndexedDB database. Async (IndexedDB delete is).
     */
    async removeWithData(id) {
      if (id === DEFAULT_ID) throw new Error("the default profile cannot be removed");
      this.remove(id);
      await deleteDatabase(dbNameFor(id));
    },
  };

  /** slugify a profile name into a stable id */
  function slugify(name) {
    const s = String(name).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || `profile-${Date.now()}`;
  }

  /**
   * Database name for a profile.
   *
   * The default profile keeps the legacy name ("leafguru") so existing
   * installs keep their data untouched — no migration, no risk. Every
   * other profile gets its own database.
   */
  function dbNameFor(profileId) {
    return profileId === DEFAULT_ID ? "leafguru" : `leafguru-${profileId}`;
  }

  /** delete an IndexedDB database (no-op when it does not exist) */
  function deleteDatabase(name) {
    return new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.deleteDatabase(name);
      } catch {
        return resolve(false);
      }
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  }

  window.LeafGuru.profiles.slugify = slugify;
  window.LeafGuru.profiles.dbNameFor = dbNameFor;
  window.LeafGuru.profiles.deleteDatabase = deleteDatabase;
})();
