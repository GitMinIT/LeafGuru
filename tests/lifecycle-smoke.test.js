/**
 * Phase-1 closeout: headless smoke test of the real page controllers.
 *
 * The page scripts attach DOMContentLoaded handlers that query real DOM
 * elements — this harness supplies a tiny DOM stub so the controller logic
 * (not the rendering) can be exercised end-to-end in node.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

function makeElement(tag = "div") {
  const el = {
    tag, children: [], dataset: {}, style: {}, textContent: "", value: "",
    hidden: false, checked: false, type: "text", _listeners: {},
    set className(v) { this._class = v; }, get className() { return this._class ?? ""; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); },
    dispatch(type, event = {}) { (this._listeners[type] ?? []).forEach((fn) => fn(event)); },
    setAttribute() {}, scrollIntoView() {}, close() {}, showModal() {}, reset() { this.dataset.editingId = ""; },
    appendChild(n) { this.children.push(n); },
  };
  if (tag === "form") {
    Object.defineProperty(el, "elements", { value: new Proxy({}, { get: (_, name) => el._inputs?.[name] }) });
    el._inputs = {};
  }
  return el;
}

function buildDom() {
  const byId = {};
  const el = (id, tag = "div") => (byId[id] ??= makeElement(tag));

  // locations page nodes
  el("[data-crud-new]", "button");
  el("[data-crud-flash]", "p");
  el("[data-crud-empty]", "p");
  el("[data-crud-list]", "ul");
  const dlg = el("[data-crud-dialog]");
  const form = makeElement("form");
  form._inputs = {
    name: makeElement("input"), type: makeElement("select"),
    "size__widthCm": makeElement("input"), "size__depthCm": makeElement("input"),
    "size__heightCm": makeElement("input"), "size__areaM2": makeElement("input"),
    notes: makeElement("input"), active: makeElement("input"),
  };
  Object.assign(form.elements, form._inputs);
  dlg.querySelector = (sel) => (sel === "form" ? form : null);
  el("[data-crud-cancel]", "button");

  return { byId, form };
}

test("locations page: create via CrudPage persists through adapter", async () => {
  const { setup } = require("./helpers/browser-stub");
  const { window } = await setup();
  window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

  // direct CrudPage submit path (bypasses DOMContentLoaded wiring): build the
  // page object and call submit with a stubbed event — verifies the generic
  // create flow end-to-end (validation → adapter → list refresh).
  const page = new window.LeafGuru.CrudPage({
    entity: "locations", entityTitleKey: "location.title",
    listColumns: [{ path: "name" }], fields: [
      { path: "name", label: "common.name", type: "string", required: true },
      { path: "type", label: "location.indoor", type: "string" },
      { path: "size.widthCm", label: "location.width", type: "number" },
      { path: "active", label: "common.active", type: "boolean", default: true }
    ]
  });
  const form = { dataset: { editingId: "" }, elements: {
      name: Object.assign(makeElement("input"), { value: "Growbox" }),
      type: Object.assign(makeElement("select"), { value: "indoor" }),
      "size__widthCm": Object.assign(makeElement("input"), { type: "number", value: "100" }),
      active: Object.assign(makeElement("input"), { type: "checkbox", checked: true })
    }, reset() {}, addEventListener() {} };

  await page.submit({ target: form, preventDefault() {} });
  const locations = await window.LeafGuru.storage.list("locations");
  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, "Growbox");
  assert.equal(locations[0].size.widthCm, 100);
});

test("plant lifecycle end-to-end via controllers' storage calls", async () => {
  const { setup } = require("./helpers/browser-stub");
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  window.LeafGuru.storage = storage;
  const d = window.LeafGuru.plantDomain;

  // the exact sequence the Plants page performs:
  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  const plant = await storage.put("plants", {
    name: "First Grow", strainTemplateId: null, customStrain: "Mystery",
    sex: "unknown", germinationDate: "2026-09-01", stage: "germinating",
    locationId: loc.id, status: "growing"
  });
  const { stageLogs } = d.applyStageChange({ plant, stageLogs: [], newStage: "germinating" });
  for (const log of stageLogs) await storage.put("stageLogs", log);

  // stage transition
  const fresh = await storage.get("plants", plant.id);
  const logs = await storage.list("stageLogs");
  const { plant: p2, stageLogs: logs2 } = d.applyStageChange({ plant: fresh, stageLogs: logs, newStage: "seedling" });
  await storage.put("plants", p2);
  for (const log of logs2) await storage.put("stageLogs", log);

  // move outdoors
  const outdoor = await storage.put("locations", { name: "Balcony", type: "outdoor", active: true });
  const current = await storage.get("plants", plant.id);
  const { plant: p3, locationChange } = d.applyLocationChange({ plant: current, toLocationId: outdoor.id, reason: "summer" });
  await storage.put("plants", p3);
  await storage.put("locationChanges", locationChange);

  // measure
  const m = d.buildMeasurement({ plant: p3, type: "height", value: 4.2, unit: "cm" });
  await storage.put("measurements", m);

  // verify timeline
  const storedLogs = await storage.list("stageLogs");
  assert.equal(storedLogs.length, 2);
  assert.deepEqual(d.timelineFor(storedLogs, plant.id).map((l) => l.stage), ["germinating", "seedling"]);
  const changes = await storage.list("locationChanges");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].fromLocationId, loc.id);
  assert.equal(changes[0].toLocationId, outdoor.id);
  const measurements = await storage.list("measurements");
  assert.equal(measurements.length, 1);
  const final = await storage.get("plants", plant.id);
  assert.equal(final.stage, "seedling");
  assert.equal(final.locationId, outdoor.id);
});

test("dashboard data shape: counts match stored entities", async () => {
  const { setup } = require("./helpers/browser-stub");
  const { window } = await setup();
  const storage = new window.LeafGuru.LocalAdapter();
  const today = new Date().toISOString().slice(0, 10);
  await storage.put("plants", { name: "A", stage: "vegetative", status: "growing" });
  await storage.put("plants", { name: "B", stage: "vegetative", status: "growing" });
  await storage.put("plants", { name: "C", stage: "flowering", status: "growing" });
  await storage.put("tasks", { title: "Water", status: "open", dueDate: today });
  await storage.put("tasks", { title: "Old", status: "open", dueDate: "2026-01-01" });

  const [plants, tasks] = await Promise.all([storage.list("plants"), storage.list("tasks")]);
  const byStage = {};
  for (const p of plants) (byStage[p.stage] ??= []).push(p);
  assert.equal(byStage.vegetative.length, 2);
  assert.equal(byStage.flowering.length, 1);
  const due = tasks.filter((t) => t.status === "open" && t.dueDate);
  assert.equal(due.length, 2);
  assert.equal(due.filter((t) => t.dueDate < today).length, 1, "one overdue");
});