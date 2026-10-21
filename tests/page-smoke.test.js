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
    click() {}, close() { el._closed = true; }, showModal() { el._shown = true; }, scrollIntoView() {},
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
    el.elements = new Proxy({}, {
      get: (_, name) => {
        if (typeof name !== "string") return el._inputs[name];
        // real forms expose every descendant control — auto-create stub
        // inputs so dialog opens don't crash in tests
        if (!(name in el._inputs)) {
          const input = makeElement("input");
          input.name = name;
          el._inputs[name] = input;
        }
        return el._inputs[name];
      }
    });
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

test("REGRESSION equipment page: category filter is populated with every category", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  await storage.put("equipment", { name: "LED", category: "light", status: "in-use" });

  const doc = await bootPage(setupResult, "static/js/pages/equipment.js");
  const filter = doc._bySelector.get("[data-equip-filter-category]");
  assert.ok(filter, "category filter select exists");
  // "All" + one option per category (light, pot, soil, fan, filter,
  // nutrient, sensor, other)
  assert.equal(filter.children.length, 9,
    "category filter offers All + every category (was 1: the function was never called)");
});

test("equipment page: grid renders + tile / add tile / hover gear", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  await storage.put("equipment", {
    name: "LED", category: "light", status: "in-use", icon: "💡",
    locationAssignments: [{ locationId: loc.id, from: new Date().toISOString(), to: null }]
  });
  await storage.put("equipment", { name: "Fan", category: "fan", status: "stored" });

  const doc = await bootPage(setupResult, "static/js/pages/equipment.js");
  const grid = doc._bySelector.get("[data-equip-grid]");
  assert.ok(grid, "grid element exists");
  // + tile + one tile per item
  assert.equal(grid.children.length, 3, "add tile + two equipment tiles");
  const addTile = grid.children[0];
  assert.equal(addTile.children[0].textContent, "+", "first tile is the + tile");
  const led = grid.children.find((t) => t.children[1]?.textContent === "LED");
  assert.ok(led, "LED tile rendered");
  assert.ok(led.children[0].textContent.includes("💡"), "icon centred");
  // hover gear in the upper-left corner of the tile
  const gear = led.children[3];
  assert.equal(gear.textContent, "⚙️", "gear button present");
  assert.ok(gear._listeners?.click?.length >= 1, "gear opens the edit dialog");
  gear.dispatch("click");
  const dialog = doc._bySelector.get("[data-crud-dialog]");
  assert.equal(dialog._shown, true, "gear click opens the dialog");
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

test("tasks page: kanban board view renders cards per column", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  await storage.put("tasks", { title: "Water Alpha", status: "open", priority: "high", dueDate: "2026-09-10" });
  await storage.put("tasks", { title: "Feed Beta", status: "done", priority: "low" });
  await storage.put("tasks", { title: "Skip me", status: "skipped", priority: "low" });

  const doc = await bootPage(setupResult, "static/js/pages/tasks.js");
  const boardEl = doc._bySelector.get("[data-task-board]");
  assert.equal(boardEl.hidden, true, "list view by default");

  doc._bySelector.get("[data-task-view-toggle]").dispatch("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(boardEl.hidden, false, "board visible after toggle");
  assert.equal(String(doc._bySelector.get("[data-task-view-toggle]").textContent), "☰ List");

  const boardSel = (status) => `[data-board-list="${status}"]`;
  const openCards = boardEl.querySelector(boardSel("open")).children;
  assert.equal(openCards.length, 1);
  assert.match(openCards[0].children[0].textContent, /Water Alpha/);
  assert.equal(boardEl.querySelector(boardSel("done")).children.length, 1);
  assert.equal(boardEl.querySelector(boardSel("skipped")).children.length, 1);
  // cards are draggable (drag-and-drop between columns)
  assert.equal(openCards[0].draggable, true, "card is draggable");
  const openList = boardEl.querySelector(boardSel("open"));
  const doneList = boardEl.querySelector(boardSel("done"));
  // simulate a drag: dragstart writes the card id into the transfer,
  // the done column receives the drop
  const dragCard = openCards[0];
  let transferredId = null;
  const dataTransfer = {
    setData: (_type, id) => { transferredId = id; },
    getData: () => transferredId,
  };
  dragCard.dispatch("dragstart", { dataTransfer });
  doneList.dispatch("drop", { preventDefault() {}, dataTransfer });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(doneList.children.length, 2, "card moved to the done column");
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