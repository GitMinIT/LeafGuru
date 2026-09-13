/**
 * Shared DOM stub for page-level tests (used by page-smoke and
 * create-flows). Mirrors just enough DOM behavior for the page
 * controllers: nested querySelector auto-creation, form.elements
 * registration by name (incl. label-nested inputs), replaceWith
 * re-registration, classList, dialog close/showModal tracking.
 */
function makeElement(tag = "div") {
  const el = {
    tag, children: [], dataset: {}, style: {}, textContent: "", value: "", hidden: false,
    checked: false, type: "text", name: "", className: "", attrs: {}, title: "",
    selectedOptions: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append(...nodes) { for (const n of nodes) el.children.push(n); },
    replaceChildren(...nodes) { el.children = [...nodes]; },
    addEventListener(type, fn) { (el._listeners ??= {})[type] ??= []; el._listeners[type].push(fn); },
    dispatch(type, event = {}) { (el._listeners?.[type] ?? []).forEach((fn) => fn(event)); },
    setAttribute(k, v) { el.attrs[k] = v; },
    querySelector(sel) {
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
    closest(sel) { return sel === "dialog" ? (el._dialog ?? null) : el; },
    reset() { el.dataset.editingId = ""; el._inputs = {}; },
    click() {}, close() { el._closed = true; }, showModal() { el._shown = true; }, scrollIntoView() {},
  };
  if (tag === "form") {
    el._inputs = {};
    const register = (node) => {
      if (node && node.name) { el._inputs[node.name] = node; node._formOwner = el; }
      for (const child of node?.children ?? []) register(child);
    };
    const origAppend = el.append;
    el.append = (...nodes) => { origAppend(...nodes); nodes.forEach(register); };
    const origAppendChild = el.appendChild;
    el.appendChild = (n) => { origAppendChild(n); register(n); return n; };
    el.elements = new Proxy({}, { get: (_, name) => el._inputs[name] });
  }
  return el;
}

function makeForm() {
  return makeElement("form");
}

function makeDocument() {
  const bySelector = new Map();
  const get = (sel) => {
    if (bySelector.has(sel)) return bySelector.get(sel);
    const spaceAt = sel.indexOf(" ");
    let el;
    if (spaceAt === -1) el = makeElement(sel.includes("form") ? "form" : "div");
    else {
      const parent = get(sel.slice(0, spaceAt));
      el = parent.querySelector(sel.slice(spaceAt + 1));
      // real DOM: the form lives inside its dialog — wire closest("dialog")
      if (parent.tag === "div" && /^\[data-crud-dialog\]|\[data-plant-edit\]/.test(sel)) el._dialog = parent;
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
 * Boot a page controller in a vm sandbox bound to a fresh DOM stub.
 * preRegister: { selector: element } — register BEFORE the page's
 * DOMContentLoaded handler runs, so listeners bind to the same instance.
 */
async function bootPage(setupResult, pageFile, {
  withCrud = false, preRegister = {}, extraScripts = []
} = {}) {
  const { window } = setupResult;
  const doc = makeDocument();
  for (const [sel, el] of Object.entries(preRegister)) doc._bySelector.set(sel, el);
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
  const vm = require("node:vm");
  const fs = require("node:fs");
  vm.createContext(sandbox);
  const load = (rel) => vm.runInContext(fs.readFileSync(rel, "utf8"), sandbox, { filename: rel });
  if (withCrud) load("static/js/model/crud.js");
  load("static/js/model/ui.js"); // bind to THIS doc so dialog errors render
  for (const rel of extraScripts) load(rel);
  load(pageFile);
  for (const fn of domReady) await fn();
  await new Promise((r) => setImmediate(r));
  return { doc, sandbox };
}

module.exports = { makeElement, makeForm, makeDocument, bootPage };