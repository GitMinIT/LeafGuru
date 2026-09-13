/**
 * Regression tests: minimal-create flows through the real submit handlers.
 *
 * Reproduces the reported bug: creating a record with EMPTY optional
 * fields submitted null for fields whose schemas were non-nullable —
 * every minimal create failed validation with the error rendered behind
 * the dialog backdrop ("buttons do nothing").
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeElement, makeForm, bootPage } = require("./helpers/dom-stub");

/** simulate <form> submit the way the browser would fire the submit event */
function submitForm(doc, formSel, values) {
  let form = doc.querySelector(formSel);
  if (!form || form.tag !== "form" || !form.elements) {
    form = makeForm();
    doc._bySelector.set(formSel, form);
  }
  form.dataset.editingId = "";
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements[name] ?? (() => {
      const el = makeElement("input");
      el.name = name;
      form.appendChild(el);
      return el;
    })();
    if (value === true || value === false) { input.checked = value; input.type = "checkbox"; }
    else { input.value = value; input.type = typeof value === "number" ? "number" : input.type; }
  }
  form.dispatch("submit", { target: form, preventDefault() {} });
  return form;
}

test("REGRESSION strains: create with only a name (all optional fields empty)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/strains.js", { withCrud: true });
  submitForm(doc, "[data-crud-dialog] form", {
    name: "Northern Dream",
    genotype: "unknown", // real browsers: select defaults to first option
    "stageDurations__seedling": "",
    "stageDurations__vegetative": "",
    "stageDurations__flowering": "",
    expectedHeightCm: "",
    breeder: "",
    characteristics: "",
    notes: ""
  });
  await new Promise((r) => setImmediate(r));

  const strains = await storage.list("strainTemplates");
  assert.equal(strains.length, 1, "strain created with minimal input");
  assert.equal(strains[0].name, "Northern Dream");
  assert.equal(strains[0].genotype, "unknown");
  assert.equal(strains[0].breeder, null);
  assert.equal(strains[0].expectedHeightCm, null);
  assert.equal(strains[0].stageDurations.seedling, null);
});

test("REGRESSION strains: create with all fields filled still works", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/strains.js", { withCrud: true });
  submitForm(doc, "[data-crud-dialog] form", {
    name: "Full Strain",
    genotype: "hybrid",
    breeder: "Seeds Co",
    "stageDurations__seedling": 14,
    "stageDurations__vegetative": 30,
    "stageDurations__flowering": 56,
    expectedHeightCm: 120,
    characteristics: "resinous",
    notes: "calm"
  });
  await new Promise((r) => setImmediate(r));
  const strains = await storage.list("strainTemplates");
  assert.equal(strains.length, 1);
  assert.equal(strains[0].stageDurations.seedling, 14);
  assert.equal(strains[0].expectedHeightCm, 120);
});

test("REGRESSION locations: create with only a name (size/notes empty)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/locations.js", { withCrud: true });
  submitForm(doc, "[data-crud-dialog] form", {
    name: "Balcony", type: "outdoor", notes: "",
    "size__widthCm": "", "size__depthCm": "", "size__heightCm": "", "size__areaM2": "",
    active: true
  });
  await new Promise((r) => setImmediate(r));
  const locations = await storage.list("locations");
  assert.equal(locations.length, 1, "location created with minimal input");
  assert.equal(locations[0].name, "Balcony");
  assert.equal(locations[0].size.widthCm, null);
});

test("REGRESSION plants: create without germination date (the reported error)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  // pre-register the inline create form so the page's listener binds to it
  const { doc } = await bootPage(setupResult, "static/js/pages/plants.js", {
    preRegister: { "#plant-create": makeForm() }
  });
  submitForm(doc, "#plant-create", {
    name: "No Date Plant",
    strainTemplateId: "",
    customStrain: "",
    sex: "unknown",
    stage: "seedling",
    germinationDate: "",   // ← empty: this produced "germinationDate expected type string, got null"
    locationId: "",
    growId: ""
  });
  await new Promise((r) => setImmediate(r));
  const plants = await storage.list("plants");
  assert.equal(plants.length, 1, "plant created without germination date");
  assert.equal(plants[0].name, "No Date Plant");
  assert.equal(plants[0].germinationDate, null);
  // initial stage log was opened
  const logs = await storage.list("stageLogs");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].stage, "seedling");
});

test("REGRESSION equipment: create with only name/category/status", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/equipment.js");
  const form = doc.querySelector("[data-crud-dialog] form");
  form.dataset.editingId = "";
  for (const [name, value] of Object.entries({
    name: "LED Panel", specs: "", purchaseDate: "", cost: "", notes: ""
  })) {
    const input = form.elements[name] ?? (() => { const el = makeElement("input"); el.name = name; form.appendChild(el); return el; })();
    input.value = value;
  }
  doc.querySelector("#equip-category").value = "light";
  doc.querySelector("#equip-status").value = "stored";
  doc.querySelector("#equip-currency").value = "";
  doc.querySelector("#equip-grow").value = "";
  doc.querySelector("#equip-everywhere").checked = false;
  form.dispatch("submit", { target: form, preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  const equipment = await storage.list("equipment");
  assert.equal(equipment.length, 1, "equipment created with minimal input");
  assert.equal(equipment[0].name, "LED Panel");
  assert.equal(equipment[0].purchaseDate, null);
  assert.equal(equipment[0].cost, null);
});

test("REGRESSION tasks: create with only a title (due date, plant, location empty)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/tasks.js");
  const form = doc.querySelector("[data-crud-dialog] form");
  form.dataset.editingId = "";
  for (const [name, value] of Object.entries({
    title: "Water the girls", description: "", dueDate: ""
  })) {
    const input = form.elements[name] ?? (() => { const el = makeElement("input"); el.name = name; form.appendChild(el); return el; })();
    input.value = value;
  }
  doc.querySelector("#task-priority").value = "medium";
  doc.querySelector("#task-plant").value = "";
  doc.querySelector("#task-location").value = "";
  doc.querySelector("#task-grow").value = "";
  doc.querySelector("#task-stage-hint").value = "";
  form.dispatch("submit", { target: form, preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  const tasks = await storage.list("tasks");
  assert.equal(tasks.length, 1, "task created with minimal input");
  assert.equal(tasks[0].title, "Water the girls");
  assert.equal(tasks[0].status, "open");
  assert.equal(tasks[0].dueDate, null);
});

test("REGRESSION grows: create with only a name + status (dates, notes empty)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/grows.js");
  const form = doc.querySelector("[data-crud-dialog] form");
  form.dataset.editingId = "";
  const nameInput = form.elements.name ?? (() => { const el = makeElement("input"); el.name = "name"; form.appendChild(el); return el; })();
  nameInput.value = "Summer Grow";
  doc.querySelector("#grow-status").value = "planned";
  doc.querySelector("#grow-start").value = "";
  doc.querySelector("#grow-end").value = "";
  doc.querySelector("#grow-notes").value = "";
  const locSel = doc.querySelector("#grow-locations");
  locSel.selectedOptions = [];
  form.dispatch("submit", { target: form, preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  const grows = await storage.list("grows");
  assert.equal(grows.length, 1, "grow created with minimal input");
  assert.equal(grows[0].name, "Summer Grow");
  assert.equal(grows[0].startDate, null);
});

test("validation errors now surface in the dialog (data-crud-error element)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const { doc } = await bootPage(setupResult, "static/js/pages/strains.js", { withCrud: true });
  // empty name → required error must appear IN the dialog, not only behind it
  submitForm(doc, "[data-crud-dialog] form", { name: "", genotype: "unknown" });
  await new Promise((r) => setImmediate(r));
  const errEl = doc.querySelector("[data-crud-dialog] form").closest("dialog")
    ? doc.querySelector("[data-crud-dialog]").querySelector("[data-crud-error]")
    : doc.querySelector("[data-crud-error]");
  assert.ok(errEl, "error element exists in dialog");
  assert.equal(errEl.hidden, false, "error is shown");
  assert.match(String(errEl.textContent), /Validation failed/i);
  assert.equal((await storage.list("strainTemplates")).length, 0, "nothing saved");
});