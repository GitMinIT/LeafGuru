/**
 * Regression + smoke tests: page controllers against a minimal DOM stub.
 * Guards against wiring bugs (e.g. the renderList self-recursion that
 * slipped through schema/adapter tests) by exercising list rendering.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function makeElement(tag = "div") {
  const el = {
    tag, children: [], dataset: {}, style: {}, textContent: "", value: "", hidden: false,
    checked: false, type: "text", name: "", className: "", attrs: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    title: "",
    append(...nodes) {
      for (const n of nodes) { el.children.push(n); }
    },
    replaceChildren(...nodes) { el.children = [...nodes]; },
    addEventListener(type, fn) { (el._listeners ??= {})[type] ??= []; el._listeners[type].push(fn); },
    dispatch(type, event = {}) { (el._listeners?.[type] ?? []).forEach((fn) => fn(event)); },
    setAttribute(k, v) { el.attrs[k] = v; },
    // nested queries: search real children (name/tag match) first, then
    // auto-create a stable child so DOM-patching page code finds something
    querySelector(sel) {
      const nameMatch = /\[name="([^"]+)"\]|input\[name=([.\w-]+)\]|^([a-z]+)$/.exec(sel);
      const byName = nameMatch && (nameMatch[1] ?? nameMatch[2]);
      if (byName) {
        const found = (function scan(node) {
          for (const child of node.children ?? []) {
            if (child.name === byName) return child;
            const nested = scan(child);
            if (nested) return nested;
          }
          return null;
        })(el);
        if (found) return found;
      }
      const tagOnly = /^([a-z]+)$/.test(sel) ? sel : null;
      if (tagOnly) {
        const found = (function scan(node) {
          for (const child of node.children ?? []) {
            if (child.tag === tagOnly) return child;
            const nested = scan(child);
            if (nested) return nested;
          }
          return null;
        })(el);
        if (found) return found;
      }
      (el._nested ??= new Map());
      if (!el._nested.has(sel)) el._nested.set(sel, makeElement(/^form$/.test(sel) ? "form" : "div"));
      return el._nested.get(sel);
    },
    querySelectorAll() { return []; },
    appendChild(n) { el.children.push(n); return n; },
    replaceWith(node) {
      if (node && el._formOwner && el.name) {
        el._formOwner._inputs[el.name] = node;
        node._formOwner = el._formOwner;
      }
    },
    reset() { el.dataset.editingId = ""; el._inputs = {}; },
    click() {}, close() {}, showModal() {}, scrollIntoView() {},
  };
  el.closest = () => el;
  if (tag === "form") {
    el._inputs = {};
    // form.elements: register inputs by name — including those nested in
    // labels (real forms pick up descendants; pages append label>input)
    const register = (node) => {
      if (node && node.name) { el._inputs[node.name] = node; node._formOwner = el; }
      for (const child of node?.children ?? []) register(child);
    };
    const origAppend = el.append;
    el.append = (...nodes) => { origAppend(...nodes); nodes.forEach(register); };
    const origAppendChild = el.appendChild;
    el.appendChild = (n) => { origAppendChild(n); register(n); return n; };
    const origReplaceChildren = el.replaceChildren;
    el.replaceChildren = (...nodes) => { origReplaceChildren(...nodes); el._inputs = {}; nodes.forEach(register); };
    el.elements = new Proxy({}, { get: (_, name) => el._inputs[name] });
  }
  return el;
}

/** a document stub: stable element per selector; composite selectors
 * ("parent child") resolve through the parent's child registry so that
 * `document.querySelector("p c")`, `document.querySelector("p").querySelector("c")`
 * and later queries all agree on ONE element instance. */
function makeDocument() {
  const bySelector = new Map();
  const get = (sel) => {
    if (bySelector.has(sel)) return bySelector.get(sel);
    const spaceAt = sel.indexOf(" ");
    let el;
    if (spaceAt === -1) {
      el = makeElement(sel.includes("form") ? "form" : "div");
    } else {
      const parent = get(sel.slice(0, spaceAt));
      const childSel = sel.slice(spaceAt + 1);
      const child = parent.querySelector(childSel); // reuse or auto-create under parent
      el = child;
    }
    bySelector.set(sel, el);
    return el;
  };
  return {
    _bySelector: bySelector,
    createElement: (tag) => makeElement(tag),
    createElementNS: (ns, tag) => makeElement(tag),
    querySelector: (sel) => get(sel),
    querySelectorAll: () => [],
    body: makeElement("body"),
  };
}

/**
 * Load a page controller into a sandbox, fire DOMContentLoaded, wait for
 * its async work. Returns the document stub for further assertions.
 * crud.js is re-loaded into the new context so CrudPage binds to this
 * document stub (not the bare one from browser-stub).
 */
async function bootPage(setupResult, pageFile, { withCrud = false } = {}) {
  const { window, sandbox: stubSandbox } = setupResult;
  const doc = makeDocument();
  const domReady = [];
  const target = { ...window };
  const sandbox = new Proxy(target, {
    get(t, k) {
      if (k === "document") return doc;
      if (k === "addEventListener") return (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); };
      if (k === "Option") return class { constructor(textContent, value) { this.textContent = textContent; this.value = value; this.selected = false; } };
      if (k === "confirm") return () => true;
      if (k === "prompt") return () => null;
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const load = (rel) => vm.runInContext(fs.readFileSync(rel, "utf8"), sandbox, { filename: rel });
  if (withCrud) load("static/js/model/crud.js");
  load(pageFile);
  for (const fn of domReady) await fn();
  // let pending microtasks (adapter awaits) settle
  await new Promise((r) => setImmediate(r));
  return doc;
}

test("equipment page: renderList does not recurse (regression)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  await storage.put("equipment", {
    name: "LED", category: "light", status: "in-use",
    locationAssignments: [{ locationId: loc.id, from: new Date().toISOString(), to: null }]
  });
  await storage.put("equipment", { name: "Fan", category: "fan", status: "stored" });

  const doc = await bootPage(setupResult, "static/js/pages/equipment.js");
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.ok(listEl, "list element exists");
  assert.equal(listEl.children.length, 2, "two equipment rows rendered");
});

test("plants page: list renders with detail/edit/delete actions", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  await storage.put("plants", {
    name: "Alpha", strainTemplateId: null, customStrain: "Mystery",
    sex: "unknown", germinationDate: "2026-09-01", stage: "seedling",
    locationId: loc.id, status: "growing"
  });
  await storage.put("plants", {
    name: "Beta", strainTemplateId: null, customStrain: null,
    sex: "unknown", stage: "planned", status: "growing"
  });

  const doc = await bootPage(setupResult, "static/js/pages/plants.js");
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 2, "two plant rows rendered");
  const row = listEl.children[0];
  assert.equal(row.children.length, 6, "name/stage/loc/grow/status/actions");
  const actions = row.children.at(-1);
  assert.equal(actions.children.length, 3, "detail, edit, delete");
  assert.equal(actions.children[0].textContent, "Plant detail");
  assert.equal(actions.children[1].textContent, "Edit");
  assert.equal(actions.children[2].textContent, "Delete");
});

test("locations page: CrudPage renders rows + detail action", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  await storage.put("locations", { name: "Box", type: "indoor", active: true, notes: "main" });
  await storage.put("locations", { name: "Balcony", type: "outdoor", active: false });

  const doc = await bootPage(setupResult, "static/js/pages/locations.js", { withCrud: true });
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 2, "two location rows rendered");
  const row = listEl.children[0];
  // name, type, size, active, notes + actions (detail, edit, delete)
  assert.equal(row.children.length, 6);
  assert.equal(row.children.at(-1).children.length, 3, "detail, edit, delete buttons");
  assert.equal(row.children.at(-1).children[0].textContent, "Detail");
});

test("tasks page: rows render with done/skip/edit actions + overdue count", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  await storage.put("tasks", { title: "Water Alpha", status: "open", priority: "high", dueDate: "2026-01-01" });
  await storage.put("tasks", { title: "Feed Beta", status: "done", priority: "low" });
  const doc = await bootPage(setupResult, "static/js/pages/tasks.js");
  // real browsers default the select to its first option ("open"); the stub
  // starts empty, so renderList ran with an unmatched filter. Simulate the
  // real default by setting the value and firing the change handler.
  const filterEl = doc._bySelector.get("#task-status-filter");
  filterEl.value = "open";
  filterEl.dispatch("change");
  await new Promise((r) => setImmediate(r));

  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 1, "open filter shows only the open task");
  const actions = listEl.children[0].children.at(-1);
  assert.equal(actions.children.length, 3, "done, skip, edit for open tasks");
  assert.equal(String(doc._bySelector.get("[data-count-overdue]").textContent), "1", "one overdue counted");
});

test("grows page: rows render with counts", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const grow = await storage.put("grows", { name: "Summer", status: "active", locationIds: [] });
  await storage.put("plants", {
    name: "P1", strainTemplateId: null, customStrain: null, sex: "unknown",
    stage: "seedling", status: "growing", growId: grow.id
  });
  await storage.put("tasks", { title: "T1", status: "open", priority: "medium", growId: grow.id });

  const doc = await bootPage(setupResult, "static/js/pages/grows.js");
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 1);
  const row = listEl.children[0];
  // name, status, dates, counts, actions
  assert.equal(row.children.length, 5);
  assert.match(row.children[3].textContent, /1 Plants/);
});

test("strains page: CrudPage renders stage-duration rows", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  await storage.put("strainTemplates", {
    name: "Northern Dream", breeder: "Hypothetical Seeds", genotype: "hybrid",
    stageDurations: { seedling: 14, vegetative: 30, flowering: 56 },
    expectedHeightCm: 120
  });

  const doc = await bootPage(setupResult, "static/js/pages/strains.js", { withCrud: true });
  const listEl = doc._bySelector.get("[data-crud-list]");
  assert.equal(listEl.children.length, 1);
  const row = listEl.children[0];
  assert.match(row.children[4].textContent, /Seedling 14d/);
  assert.match(row.children[4].textContent, /Flowering 56d/);
});