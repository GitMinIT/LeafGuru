/** Unit tests: event popup view — verbose rendering for history/timeline. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeElement, makeDocument } = require("./helpers/dom-stub");

/** build a popup dialog the way the templates provide it (no close
 * button — dialogs close on backdrop click via ui.wireBackdropClose) */
function popupDialog() {
  const dlg = makeElement("dialog");
  const h2 = makeElement("h2");
  h2.setAttribute("data-popup-title", "");
  const body = makeElement("dl");
  body.setAttribute("data-popup-body", "");
  const actions = makeElement("div");
  actions.className = "crud-dialog-actions";
  dlg.append(h2, body, actions);
  return dlg;
}

function boot(setupResult, doc) {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const target = { ...setupResult.window };
  const sandbox = new Proxy(target, {
    get(t, k) { return k === "document" ? doc : t[k]; },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("static/js/model/history-view.js", "utf8"), sandbox, { filename: "history-view.js" });
  return sandbox.window.LeafGuru.historyView;
}

test("popup: stage event renders dates, duration, plant and raw record", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const doc = makeDocument();
  const hv = boot(setupResult, doc);

  const dlg = popupDialog();
  doc._bySelector.set("[data-event-popup]", dlg);

  const event = {
    kind: "stage", at: "2026-05-06", atEnd: "2026-05-16",
    plant: { name: "Alpha" },
    record: { id: "s1", plantId: "p1", stage: "seedling", enteredAt: "2026-05-06T08:00:00Z", leftAt: "2026-05-16T08:00:00Z" }
  };
  const opened = hv.open(event, { dialog: dlg });
  assert.equal(opened._shown, true, "dialog opened");

  const title = dlg.children[0].textContent;
  assert.match(title, /Seedling/);
  assert.match(title, /Alpha/);

  const body = dlg.children[1];
  // dt/dd pairs: date, plant, entered, left, duration, raw
  const texts = body.children.map((c) => c.textContent);
  const joined = texts.join("\n");
  assert.ok(texts.includes("2026-05-06"), "event date shown");
  assert.ok(joined.includes("Alpha"), "plant name shown");
  assert.ok(joined.includes("10"), "duration computed");
  // raw record is folded by default, expands on click
  const rawDd = body.children.find((c) => c.className === "event-popup__raw");
  assert.ok(rawDd.hidden, "raw record folded on open");
  assert.ok(rawDd.textContent.includes('"stage": "seedling"'), "raw content present");
  const findByClass = (cls, node) => (function scan(n) {
    for (const child of n.children ?? []) {
      if (child.className === cls) return child;
      const nested = scan(child);
      if (nested) return nested;
    }
    return null;
  })(node);
  const toggle = findByClass("event-popup__raw-toggle", body);
  assert.ok(toggle, "toggle button rendered");
  toggle.dispatch("click");
  assert.equal(rawDd.hidden, false, "raw record expanded");
  assert.match(toggle.textContent, /Hide raw record/);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  toggle.dispatch("click");
  assert.equal(rawDd.hidden, true, "raw record folded again");
  // backdrop close is the shared mechanism — the popup itself has no
  // close button anymore; closing is covered by the backdrop test
});

test("popup: harvest event shows yield; task shows priority/description", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const doc = makeDocument();
  const hv = boot(setupResult, doc);
  const dlg = popupDialog();

  const harvest = {
    kind: "harvest", at: "2026-07-16", plant: { name: "Alpha" },
    record: { name: "Alpha", harvestYieldG: 42.5, harvestedAt: "2026-07-16", status: "cured" }
  };
  hv.open(harvest, { dialog: dlg });
  const joined = dlg.children[1].children.map((c) => c.textContent).join("\n");
  assert.ok(joined.includes("43 g"), "yield rounded and shown");
  assert.ok(dlg.children[0].textContent.includes("Harvest"), "title says harvest");

  const task = {
    kind: "taskPlanned", at: "2026-05-19", plant: null,
    record: { title: "Water Alpha", dueDate: "2026-05-19", priority: "high", description: "2L plain water", status: "open" }
  };
  hv.open(task, { dialog: dlg });
  const taskJoined = dlg.children[1].children.map((c) => c.textContent).join("\n");
  assert.ok(taskJoined.includes("High"), "priority translated");
  assert.ok(taskJoined.includes("2L plain water"), "description shown");
  // raw is folded but its content is in the DOM
  const rawDd = dlg.children[1].children.find((c) => c.className === "event-popup__raw");
  assert.equal(rawDd.hidden, true);
  assert.ok(rawDd.textContent.includes('"title": "Water Alpha"'), "raw record present");
});

test("popup: change log of the entity renders (traceable edits)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const doc = makeDocument();
  const hv = boot(setupResult, doc);
  const dlg = popupDialog();

  // storage with a recorded edit
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  const plant = await storage.put("plants", {
    name: "Alpha", stage: "seedling", status: "growing", sex: "unknown"
  });
  const fresh = await storage.get("plants", plant.id);
  fresh.sex = "female";
  await storage.put("plants", fresh);

  const event = {
    kind: "germination", at: "2026-05-04", plant: { name: "Alpha" },
    record: await storage.get("plants", plant.id)
  };
  hv.open(event, { dialog: dlg });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  // the change-log list renders the edit entries (created + sex change)
  const findByClass = (cls, node) => (function scan(n) {
    for (const child of n.children ?? []) {
      if (child.className === cls) return child;
      const nested = scan(child);
      if (nested) return nested;
    }
    return null;
  })(node);
  const list = findByClass("event-popup__edits", dlg);
  assert.ok(list, "change log rendered");
  assert.ok(list.children.length >= 2, "created + edit entries");
  assert.ok(list.children.some((li) => String(li.textContent).includes("sex")),
    "sex change appears in the change log");
});

test("popup: auto-creates its own dialog when the page has none", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const doc = makeDocument();
  const hv = boot(setupResult, doc);
  doc.querySelector("[data-event-popup]"); // auto-create via querySelector
  const event = { kind: "growStart", at: "2026-05-04", title: "Summer",
    record: { name: "Summer", status: "active", startDate: "2026-05-04", notes: "hi" } };
  const dlg = hv.open(event);
  assert.ok(dlg, "dialog auto-created");
  assert.equal(dlg._shown, true);
});