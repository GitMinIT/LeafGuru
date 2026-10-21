/** Unit tests: calendar/time picker widget (rendered output via doc stub). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

async function bootPicker(setupResult) {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const makeElement = (tag) => {
    const el = {
      tag, children: [], dataset: {}, style: {}, textContent: "", value: "",
      hidden: false, type: "text", className: "", attrs: {},
      append(...nodes) { el.children.push(...nodes); },
      replaceChildren(...nodes) { el.children = [...nodes]; },
      addEventListener(type, fn) { (el._listeners ??= {})[type] ??= []; el._listeners[type].push(fn); },
      dispatch(type, event = {}) { (el._listeners?.[type] ?? []).forEach((fn) => fn(event)); },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      contains() { return false; },
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
  assert.equal(committed[0], "2026-09-16T20:30:00.000Z");
});