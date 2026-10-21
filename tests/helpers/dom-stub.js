/**
 * Shared DOM stub for page-level tests (used by page-smoke and
 * create-flows). Mirrors just enough DOM behavior for the page
 * controllers: nested querySelector auto-creation, form.elements
 * registration by name (incl. label-nested inputs), replaceWith
 * re-registration, classList, dialog close/showModal tracking.
 */
function makeElement(tag = "div") {
  const el = {
    tag, children: [], dataset: {}, style: {}, value: "", hidden: false,
    _text: "",
    get textContent() {
      if (this._text) return this._text;
      // real DOM: textContent aggregates the descendants
      return (this.children ?? []).map((c) => c.textContent ?? "").join("");
    },
    set textContent(v) { this._text = String(v); },
    parentNode: null, open: false,
    checked: false, type: "text", name: "", className: "", attrs: {}, title: "",
    selectedOptions: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append(...nodes) { for (const n of nodes) el.children.push(n); },
    replaceChildren(...nodes) { el.children = [...nodes]; },
    addEventListener(type, fn) { (el._listeners ??= {})[type] ??= []; el._listeners[type].push(fn); },
    dispatch(type, event = {}) { (el._listeners?.[type] ?? []).forEach((fn) => fn(event)); },
    setAttribute(k, v) {
      el.attrs[k] = String(v);
      // real DOM: data-* attributes appear on .dataset (camelCased)
      if (/^data-([a-z-]+)$/i.test(k)) {
        const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[key] = String(v);
      }
    },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    querySelector(sel) {
      // attribute selectors ([data-x]): match real children by attrs first
      const attrMatch = /^\[([\w-]+)\]$/.exec(sel);
      if (attrMatch) {
        const found = (function scan(node) {
          for (const child of node.children ?? []) {
            if (child.attrs && attrMatch[1] in child.attrs) return child;
            const nested = scan(child);
            if (nested) return nested;
          }
          return null;
        })(el);
        if (found) return found;
      }
      // tag selectors: scan real children by tag first
      if (/^[a-z]+$/.test(sel)) {
        const found = (function scan(node) {
          for (const child of node.children ?? []) {
            if (child.tag === sel) return child;
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
    appendChild(n) { el.children.push(n); n.parentNode = el; return n; },
    replaceWith(node) {
      if (node && el._formOwner && el.name) {
        el._formOwner._inputs[el.name] = node;
        node._formOwner = el._formOwner;
      }
    },
    closest(sel) { return sel === "dialog" ? (el._dialog ?? null) : el; },
    contains(node) { if (node === el) return true; return (el.children ?? []).some((c) => c.contains?.(node)); },
    reset() { el.dataset.editingId = ""; },
    click() {}, close() { el._closed = true; el.open = false; },
    showModal() { el._shown = true; el.open = true; }, scrollIntoView() {},
  };
  if (tag === "form") {
    el._inputs = {};
    el._controls = [];
    const register = (node) => {
      if (!node) return;
      if (node.name) { el._inputs[node.name] = node; node._formOwner = el; }
      if (node.tag === "input" || node.tag === "select" || node.tag === "textarea") {
        el._controls.push(node);
      }
      for (const child of node?.children ?? []) register(child);
    };
    const origAppend = el.append;
    el.append = (...nodes) => { origAppend(...nodes); nodes.forEach(register); };
    const origAppendChild = el.appendChild;
    el.appendChild = (n) => { origAppendChild(n); register(n); return n; };
    // real forms: reset() restores every control to its default state
    el.reset = () => {
      el.dataset.editingId = "";
      for (const input of el._controls) {
        if (input.type === "checkbox") input.checked = false;
        else input.value = "";
        if (Array.isArray(input.selectedOptions)) input.selectedOptions = [];
      }
    };
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