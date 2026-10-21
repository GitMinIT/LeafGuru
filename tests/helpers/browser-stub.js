/**
 * Test harness: browser-environment stub for node:test.
 *
 * Loads LeafGuru JS modules into a vm sandbox with a functional IndexedDB
 * stub (sync-apply on request creation, microtask oncomplete — mirrors the
 * observable contract of real IDB that the adapter relies on).
 *
 * Usage:
 *   const { setup, loadAdapter } = require("./helpers/browser-stub");
 *   const { window } = await setup();           // sandbox with LeafGuru core
 *   await loadAdapter(window);                  // LocalAdapter + schemas
 *   const storage = new window.LeafGuru.LocalAdapter();
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

function createIndexedDbStub({ BlobClass } = {}) {
  // One store map PER DATABASE: profiles rely on separate databases being
  // isolated from each other, so a single shared store would make the
  // tests lie.
  const databases = {}; // dbName -> { entityName -> Map(id -> record) }
  databases.leafguru = {};        // the default database
  const store = databases.leafguru; // live view (back-compat for setup().store)
  // blob-preserving clone: Blob instances are immutable — keep identity;
  // plain objects deep-copied (JSON path is fine for test data)
  const clone = (v) => {
    if (BlobClass && v instanceof BlobClass) return v;
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = clone(val);
      return out;
    }
    return v;
  };

  class FakeRequest {
    constructor(apply) {
      // apply synchronously: real IDB guarantees a completed request before
      // its transaction's oncomplete fires — the adapter relies on that.
      try { this.result = apply(); } catch (e) { this.error = e; }
    }
    set onsuccess(fn) { queueMicrotask(() => fn({ target: this })); }
    set onerror(fn) { if (this.error) queueMicrotask(() => fn({ target: this })); }
  }

  class FakeTx {
    constructor(dbStore) { this._store = dbStore; }
    objectStore(name) {
      // `this` inside the returned object literal is the literal itself,
      // so the map has to be captured here.
      const s = this._store;
      return {
        put(rec) { return new FakeRequest(() => { (s[name] ??= new Map()).set(rec.id, clone(rec)); return rec; }); },
        delete(id) { return new FakeRequest(() => { s[name]?.delete(id); return undefined; }); },
        clear() { return new FakeRequest(() => { s[name] = new Map(); return undefined; }); },
        get(id) { return new FakeRequest(() => { const v = s[name]?.get(id) ?? null; return v ? clone(v) : v; }); },
        getAll() { return new FakeRequest(() => [...(s[name]?.values() ?? [])].map(clone)); },
      };
    }
    set oncomplete(fn) { queueMicrotask(fn); }
    set onerror(fn) {}
  }

  /** create (or reuse) the object-store map of one database */
  function dbStore(name) {
    if (!databases[name]) databases[name] = {};
    return databases[name];
  }

  function makeDb(name) {
    const dbStoreFor = dbStore(name);
    return {
      name,
      transaction: () => new FakeTx(dbStoreFor),
      objectStoreNames: { contains: () => true },
    };
  }

  return {
    store,
    databases,
    indexedDB: {
      open: (dbName = "leafguru") => {
        const req = { result: undefined, error: undefined };
        let instance = null;
        queueMicrotask(() => { instance = makeDb(dbName); req.result = instance; });
        return {
          set onupgradeneeded(fn) {},
          set onerror(fn) {},
          set onsuccess(fn) { queueMicrotask(() => fn({ target: req })); },
          get result() { return instance; },
        };
      },
      deleteDatabase: (dbName) => {
        const req = {};
        queueMicrotask(() => {
          if (dbName === "leafguru") {
            for (const k of Object.keys(databases.leafguru)) delete databases.leafguru[k];
          } else {
            delete databases[dbName];
          }
          if (req.onsuccess) req.onsuccess();
        });
        return {
          set onsuccess(fn) { req.onsuccess = fn; },
          set onerror(fn) { req.onerror = fn; },
          set onblocked(fn) { req.onblocked = fn; },
        };
      },
    },
  };
}

class BlobStub {
  constructor(parts, opts) {
    this.parts = parts;
    this.type = opts?.type ?? "";
    const joined = (parts ?? []).join("");
    if (joined.startsWith("data:")) this.__dataUrl = joined;
  }
  get size() { return (this.parts ?? []).join("").length; }
}

async function setup({ locale = "en" } = {}) {
  const idb = createIndexedDbStub({ BlobClass: BlobStub });
  const fetched = [];
  const localStorageData = new Map();
  const localStorage = {
    getItem: (k) => (localStorageData.has(k) ? localStorageData.get(k) : null),
    setItem: (k, v) => localStorageData.set(k, String(v)),
    removeItem: (k) => localStorageData.delete(k),
    _map: localStorageData,
  };

  const sandbox = {
    console, Promise, Map, Set, Date, JSON, Error, TypeError,
    setTimeout, clearTimeout, queueMicrotask,
    Boolean, Number, String, Math, Object, Array, RegExp, Intl, Uint8Array,
    structuredClone: (v) => {
      if (v instanceof BlobStub) return v; // Blobs are immutable — identity is fine
      if (Array.isArray(v)) return v.map((x) => sandbox.structuredClone(x));
      if (v && typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v)) out[k] = sandbox.structuredClone(val);
        return out;
      }
      return v;
    },
    crypto: require("node:crypto").webcrypto,
    navigator: {},
    localStorage,
    indexedDB: idb.indexedDB,
    fetch: async (url) => {
      fetched.push(url);
      if (url.includes("/static/js/schemas/")) {
        const file = path.join(ROOT, "schemas", path.basename(url));
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
      }
      if (url.includes("/static/js/data/")) {
        const file = path.join(ROOT, "static", "js", "data", path.basename(url));
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
      }
      if (url.includes("/static/js/i18n/")) {
        const file = path.join(ROOT, "static", "js", "i18n", path.basename(url));
        return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    URL: { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    FileReader: class {
      readAsDataURL(blob) {
        queueMicrotask(() => {
          if (typeof blob === "string" && blob.startsWith("data:")) { this.result = blob; }
          else if (blob && blob.__dataUrl) { this.result = blob.__dataUrl; }
          else { this.result = "data:application/octet-stream;base64,"; }
          this.onload?.();
        });
      }
      set onload(fn) { this._onload = fn; }
      get onload() { return this._onload; }
      set onerror(fn) { this._onerror = fn; }
    },
    Blob: BlobStub,
    document: {
      createElement: () => ({ click() {}, set href(_) {}, set download(_) {} }),
      // minimal SVG element stub for chart.js: attribute storage + children
      createElementNS: (ns, tag) => {
        const node = {
          tag, ns, children: [], attrs: {}, textContent: "",
          append(...nodes) { node.children.push(...nodes); },
          setAttribute(k, v) { node.attrs[k] = String(v); },
          getAttribute(k) { return node.attrs[k]; },
        };
        return node;
      },
      querySelector: () => null,
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const load = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
  load("static/js/version.js");
  load("static/js/model/uuid.js");
  load("static/js/model/settings-store.js");
  load("static/js/model/format.js");
  load("static/js/model/date-input.js");
  load("static/js/i18n/loader.js");
  load("static/js/model/schema-loader.js");
  load("static/js/model/validator.js");
  load("static/js/adapter/storage-adapter.js");
  load("static/js/adapter/local-adapter.js");
  load("static/js/model/data-io.js");
  load("static/js/model/photos.js");
  load("static/js/model/crud.js");
  load("static/js/model/plant-domain.js");
  load("static/js/model/task-domain.js");
  load("static/js/model/location-domain.js");
  load("static/js/model/grow-domain.js");
  load("static/js/model/chart.js");
  load("static/js/model/timeline-domain.js");
  load("static/js/model/history-domain.js");
  load("static/js/model/history-view.js");
  load("static/js/model/log-domain.js");
  load("static/js/model/ui.js");
  await sandbox.window.LeafGuru.loadSchemas();
  await sandbox.window.LeafGuru.i18n.init(locale);

  return { window: sandbox.window, sandbox, store: idb.store, load, fetched };
}

module.exports = { setup };