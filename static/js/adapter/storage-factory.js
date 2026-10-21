/**
 * LeafGuru — storage factory.
 *
 * Decides where the data lives:
 *
 *   local mode  -> IndexedDB in this browser (the default for the
 *                  browser-only app; also the escape hatch)
 *   server mode -> the LeafGuru API (a self-hosted instance on a LAN,
 *                  or the hosted service)
 *
 * The server advertises its mode at /api/v1/auth/status/. The client
 * then resolves which adapter to use, and NEVER silently abandons data
 * the user already has:
 *
 *   server reachable + server has data      -> server
 *   server reachable + server empty
 *                                      + browser has data -> stay LOCAL
 *                                        and offer the one-time
 *                                        import (see migration.js)
 *   server reachable + both empty          -> server
 *   no server                              -> local
 *
 * The user can always override the choice; it is remembered.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /** status of the server, if there is one */
  window.LeafGuru.serverStatus = null;

  /** the in-flight probe, so it only ever runs once */
  let statusPromise = null;

  /**
   * Probe the server once and remember the answer.
   *
   * The profile UI has to know the mode BEFORE it can decide whether a
   * "profile" is an IndexedDB database or a server workspace. It
   * cannot wait for createStorage() (a page may never call it), so it
   * awaits this instead. Without it the profile UI binds to the local
   * store even when the app runs against a server.
   */
  async function ensureServerStatus() {
    if (window.LeafGuru.serverStatus) return window.LeafGuru.serverStatus;
    if (!statusPromise) {
      statusPromise = (async () => {
        try {
          const res = await fetch("/api/v1/auth/status/", {
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
          });
          if (res.ok) {
            const payload = await res.json();
            if (payload?.server) window.LeafGuru.serverStatus = payload;
          }
        } catch {
          // no server (opened as a static file, or the API is down)
        }
        return window.LeafGuru.serverStatus;
      })();
    }
    return statusPromise;
  }
  window.LeafGuru.ensureServerStatus = ensureServerStatus;

  /** how the user chose to store their data: "local" | "server" | null */
  window.LeafGuru.storageMode = null;

  const MODE_KEY = "leafguru.storageMode";

  function readMode() {
    try {
      return localStorage.getItem(MODE_KEY);
    } catch {
      return null;
    }
  }

  function writeMode(mode) {
    try {
      if (mode) localStorage.setItem(MODE_KEY, mode);
      else localStorage.removeItem(MODE_KEY);
    } catch { /* private mode */ }
  }

  /** does the browser hold any data? (cheap check on the default profile) */
  async function localHasData() {
    try {
      const storage = new window.LeafGuru.LocalAdapter();
      for (const entity of ["plants", "grows", "tasks", "logEntries"]) {
        const records = await storage.list(entity);
        if (records.length) return true;
      }
    } catch { /* no data */ }
    return false;
  }

  async function createStorage() {
    const base = "/api/v1";

    // 1. the user's explicit choice wins
    const chosen = readMode();
    if (chosen === "local") {
      window.LeafGuru.storageMode = "local";
      return new window.LeafGuru.LocalAdapter();
    }

    // 2. is there a server?
    const status = await ensureServerStatus();

    if (!status) {
      window.LeafGuru.storageMode = "local";
      return new window.LeafGuru.LocalAdapter();
    }

    window.LeafGuru.serverStatus = status;

    // 3. accounts required but nobody signed in -> go to the login form
    if (status.authRequired && !status.user) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login/?next=${encodeURIComponent(next)}`;
      return new Promise(() => {});   // never resolves: the page navigates away
    }

    if (chosen === "server") {
      window.LeafGuru.storageMode = "server";
      return new window.LeafGuru.ServerAdapter();
    }

    // 4. auto: never abandon data the user already has.
    //    If the browser holds anything, stay local — even when the
    //    server has data too. Otherwise the browser's copy would look
    //    like it vanished, and the user would have no idea where it
    //    went. The Data page offers the one-time move to the server.
    const localHas = await localHasData();
    if (localHas) {
      window.LeafGuru.storageMode = "local";
      window.LeafGuru.migrationPending = true;
      return new window.LeafGuru.LocalAdapter();
    }

    // the browser is empty: the server is the better home for the data
    // (it survives a browser reset and is reachable from any device)
    window.LeafGuru.storageMode = "server";
    return new window.LeafGuru.ServerAdapter();
  }

  window.LeafGuru.createStorage = createStorage;
  window.LeafGuru.isServerMode = () => window.LeafGuru.storageMode === "server";
  window.LeafGuru.isAuthRequired = () => !!window.LeafGuru.serverStatus?.authRequired;
  window.LeafGuru.setStorageMode = (mode) => {
    writeMode(mode);
    window.LeafGuru.storageMode = mode;
    location.reload();
  };
  window.LeafGuru.getStorageMode = readMode;
})();
