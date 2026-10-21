/** Unit tests: calendar/time picker widget (rendered output via doc stub). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

async function bootPicker(setupResult) {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const makeElement = (tag) => {
    const el = {
      tag, children: [], dataset: {}, style: {}, textContent: "", value: "", parentNode: null,
      hidden: false, type: "text", className: "", attrs: {},
      append(...nodes) { el.children.push(...nodes); for (const n of nodes) n.parentNode = el; },
      appendChild(n) { el.children.push(n); n.parentNode = el; return n; },
      replaceChildren(...nodes) { el.children = [...nodes]; },
      addEventListener(type, fn) { (el._listeners ??= {})[type] ??= []; el._listeners[type].push(fn); },
      dispatch(type, event = {}) { (el._listeners?.[type] ?? []).forEach((fn) => fn(event)); },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      contains(node) { if (node === el) return true; return (el.children ?? []).some((c) => c.contains?.(node)); },
      classList: { add() {}, remove() {}, contains() { return false; } },
    };
    return el;
  };
  const doc = {
    createElement: (t) => makeElement(t),
    querySelectorAll: () => [],
    addEventListener() {},
    body: makeElement("body"),
  };
  const target = { ...setupResult.window };
  const sandbox = new Proxy(target, {
    get(t, k) {
      if (k === "document") return doc;
      if (k === "Option") return class { constructor(text, value) { this.textContent = text; this.value = value; this.selected = false; } };
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("static/js/model/date-picker.js", "utf8"), sandbox);
  return { picker: sandbox.window.LeafGuru.dateTimePicker, doc };
}

test("picker: date input opens a month grid and commits the picked day", async () => {
  const setupResult = await setup();
  const w = setupResult.window;
  const { picker, doc } = await bootPicker(setupResult);
  w.LeafGuru.settings.set("dateFormat", "iso");
  w.LeafGuru.settings.set("timezone", "UTC");

  const input = { dataset: { dateInput: "" }, value: "", getBoundingClientRect: () => ({ left: 10, bottom: 30 }) };
  const committed = [];
  const realSet = w.LeafGuru.dateInput.set;
  w.LeafGuru.dateInput.set = (inp, iso) => { committed.push(iso); realSet(inp, iso); };

  // open via the click-binding path (closest → input)
  const clickHandlers = [];
  doc.addEventListener = (type, fn) => { if (type === "click") clickHandlers.push(fn); };
  picker.bind();
  for (const handler of [...clickHandlers]) handler({ target: { closest: () => input } });

  const pop = doc.body.children[0];
  assert.equal(pop.hidden, false, "popover opens");
  const head = pop.children[0];
  assert.ok(String(head.children[1].textContent).length > 0, "month label rendered");
  const grid = pop.children[1];
  assert.ok(grid.children.length >= 28, "day cells rendered");

  // pick day 16 → date-only input commits immediately (noon anchor)
  grid.children[15].dispatch("click");
  assert.equal(committed.length, 1, "date committed on pick");
  assert.match(String(committed[0]), /T12:00:00/, "noon anchor for date-only");
  // no clock row for date-only inputs
  assert.equal(pop.children.length, 2, "no clock row on date inputs");
});

test("picker: datetime input shows clock row, apply commits date+time", async () => {
  const setupResult = await setup();
  const w = setupResult.window;
  const { picker, doc } = await bootPicker(setupResult);
  w.LeafGuru.settings.set("dateFormat", "iso");
  w.LeafGuru.settings.set("timezone", "UTC");
  w.LeafGuru.settings.set("hourFormat", "h24");

  const input = { dataset: { datetimeInput: "" }, value: "", getBoundingClientRect: () => ({ left: 10, bottom: 30 }) };
  const committed = [];
  w.LeafGuru.dateInput.set = (inp, iso) => { committed.push(iso); };

  const clickHandlers = [];
  doc.addEventListener = (type, fn) => { if (type === "click") clickHandlers.push(fn); };
  picker.bind();
  for (const handler of [...clickHandlers]) handler({ target: { closest: () => input } });

  const pop = doc.body.children[0];
  assert.equal(pop.children.length, 3, "head + grid + clock row");
  const clock = pop.children[2];
  assert.equal(clock.children.length, 3, "hour select, minute select, apply");
  const hourSel = clock.children[0];
  const minSel = clock.children[1];
  assert.equal(hourSel.children.length, 24, "24 hour options");
  assert.equal(minSel.children.length, 12, "5-minute steps");
  // pick day 16, then apply with hour 20 / minute 30
  pop.children[1].children[15].dispatch("click");
  hourSel.value = "20";
  minSel.value = "30";
  clock.children[2].dispatch("click");
  assert.equal(committed.length, 1, "apply commits");
  const _now = new Date(); 
  const _ym = `${_now.getUTCFullYear()}-${String(_now.getUTCMonth()+1).padStart(2,"0")}`;
  assert.equal(committed[0], `${_ym}-16T20:30:00.000Z`);
});
/**
 * REGRESSION: the calendar popover must live inside an open modal dialog.
 *
 * A modal <dialog> is promoted to the browser TOP LAYER, which paints
 * above anything in normal document flow. A popover appended to <body>
 * therefore rendered *behind* the dialog and every click on a day cell
 * was intercepted by the dialog — the "date field does nothing" bug.
 */
test("REGRESSION picker: popover is anchored inside an open modal dialog", async () => {
  const setupResult = await setup();
  const w = setupResult.window;
  const { picker, doc } = await bootPicker(setupResult);
  w.LeafGuru.settings.set("dateFormat", "iso");
  w.LeafGuru.settings.set("timezone", "UTC");

  const dialog = doc.createElement("dialog");
  dialog.open = true;
  const input = { dataset: { dateInput: "" }, value: "", getBoundingClientRect: () => ({ left: 10, bottom: 30 }) };
  input.closest = (sel) => (sel === "dialog" ? dialog : null);
  dialog.appendChild(input);

  const clickHandlers = [];
  doc.addEventListener = (type, fn) => { if (type === "click") clickHandlers.push(fn); };
  picker.bind();
  for (const handler of [...clickHandlers]) handler({ target: { closest: () => input } });

  const pop = dialog.children.find((c) => c.className === "date-picker");
  assert.ok(pop, "popover created inside the dialog");
  assert.equal(pop.parentNode, dialog,
    "popover must be a child of the open dialog, not <body>");
  assert.equal(doc.body.children.includes(pop), false,
    "popover must NOT be a child of <body> while a modal dialog is open");
});

test("REGRESSION picker: popover falls back to <body> outside any dialog", async () => {
  const setupResult = await setup();
  const w = setupResult.window;
  const { picker, doc } = await bootPicker(setupResult);
  w.LeafGuru.settings.set("dateFormat", "iso");
  w.LeafGuru.settings.set("timezone", "UTC");

  const input = { dataset: { dateInput: "" }, value: "", getBoundingClientRect: () => ({ left: 10, bottom: 30 }) };
  const clickHandlers = [];
  doc.addEventListener = (type, fn) => { if (type === "click") clickHandlers.push(fn); };
  picker.bind();
  for (const handler of [...clickHandlers]) handler({ target: { closest: () => input } });

  const pop = doc.body.children[0];
  assert.ok(pop, "popover created");
  assert.equal(pop.parentNode, doc.body, "popover anchored to <body> when no dialog is open");
});
