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
  const store = {}; // entityName -> Map(id -> record)
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
    objectStore(name) {
      return {
        put(rec) { return new FakeRequest(() => { (store[name] ??= new Map()).set(rec.id, clone(rec)); return rec; }); },
        delete(id) { return new FakeRequest(() => { store[name]?.delete(id); return undefined; }); },
        clear() { return new FakeRequest(() => { store[name] = new Map(); return undefined; }); },
        get(id) { return new FakeRequest(() => store[name]?.get(id) ?? null); },
        getAll() { return new FakeRequest(() => [...(store[name]?.values() ?? [])]); },
      };
    }
    set oncomplete(fn) { queueMicrotask(fn); }
    set onerror(fn) {}
  }

  const fakeDB = { transaction: () => new FakeTx(), objectStoreNames: { contains: () => true } };
  let instance = null;
  return {
    store,
    indexedDB: {
      open: () => {
        const req = { result: undefined, error: undefined };
        queueMicrotask(() => { instance ??= fakeDB; req.result = instance; });
        return {
          set onupgradeneeded(fn) {},
          set onerror(fn) {},
          set onsuccess(fn) { queueMicrotask(() => fn({ target: req })); },
          get result() { return instance; },
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

  const sandbox = {
    console, Promise, Map, Set, Date, JSON, Error, TypeError, setTimeout, queueMicrotask,
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
    indexedDB: idb.indexedDB,
    fetch: async (url) => {
      fetched.push(url);
      if (url.includes("/static/js/schemas/")) {
        const file = path.join(ROOT, "schemas", path.basename(url));
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
      querySelector: () => null,
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const load = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
  load("static/js/version.js");
  load("static/js/model/uuid.js");
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
  await sandbox.window.LeafGuru.loadSchemas();
  await sandbox.window.LeafGuru.i18n.init(locale);

  return { window: sandbox.window, sandbox, store: idb.store, load, fetched };
}

module.exports = { setup };