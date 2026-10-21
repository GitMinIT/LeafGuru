/**
 * Quick-add flow: the global "+ Log" dialog writes a LogEntry + linked
 * photos through the real submit handler — the daily-driver path.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { makeElement, makeForm, makeDocument } = require("./helpers/dom-stub");

async function bootQuickLog(setupResult, doc) {
  const target = { ...setupResult.window };
  const domReady = [];
  const sandbox = new Proxy(target, {
    get(t, k) {
      if (k === "document") return doc;
      if (k === "addEventListener") return (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); };
      if (k === "Option") return class { constructor(textContent, value) { this.textContent = textContent; this.value = value; this.selected = false; } };
      if (k === "confirm") return () => true;
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("static/js/model/log-domain.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("static/js/model/quick-log.js", "utf8"), sandbox);
  for (const fn of domReady) await fn();
  await new Promise((r) => setImmediate(r));
  return sandbox.window.LeafGuru.quickLog;
}

function logDialog() {
  const dlg = makeElement("dialog");
  const form = makeForm();
  for (const [name, type] of [["text", "textarea"], ["amountL", "number"], ["ph", "number"], ["ec", "number"], ["tempC", "number"]]) {
    const input = makeElement(type === "textarea" ? "textarea" : "input");
    input.name = name;
    form.appendChild(input);
  }
  const growSel = makeElement("select");
  growSel.setAttribute("data-log-grow", "");
  growSel.value = "";
  form.appendChild(growSel); // real markup: the select is a form control
  const chipsWrap = makeElement("fieldset");
  chipsWrap.setAttribute("data-log-categories", "");
  const atInput = makeElement("input");
  atInput.setAttribute("data-log-at", "");
  const plantSel = makeElement("select");
  plantSel.setAttribute("data-log-plants", "");
  plantSel.selectedOptions = [];
  const locSel = makeElement("select");
  locSel.setAttribute("data-log-location", "");
  const fileInput = makeElement("input");
  fileInput.setAttribute("data-log-photos", "");
  fileInput.files = [];
  const errEl = makeElement("p");
  errEl.setAttribute("data-log-error", "");
  const cancel = makeElement("button");
  cancel.setAttribute("data-log-cancel", "");
  const actions = makeElement("div");
  actions.append(cancel);
  dlg.append(form, errEl, actions);
  return { dlg, form, growSel, chipsWrap, atInput, plantSel, locSel, fileInput, errEl };
}

/** collect the category checkboxes quick-log rendered into chipsWrap */
function chipsOf(chipsWrap) {
  const boxes = {};
  for (const label of chipsWrap.children) {
    const box = label.children[0];
    if (box?.type === "checkbox") boxes[box.value] = box;
  }
  // the real DOM uses querySelectorAll("input:checked") — mirror it here
  chipsWrap.querySelectorAll = (sel) =>
    sel === "input:checked" ? Object.values(boxes).filter((b) => b.checked) : [];
  return boxes;
}

test("quick log: open fills selectors, submit persists entry (minimal)", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  const grow = await storage.put("grows", { name: "Autumn", status: "active" });
  const plant = await storage.put("plants", { name: "Alpha", stage: "flowering", status: "growing", growId: grow.id });

  const doc = makeDocument();
  const { dlg, form, growSel, chipsWrap } = logDialog();
  doc._bySelector.set("[data-log-dialog]", dlg);
  for (const [sel, el] of [["[data-log-grow]", growSel], ["[data-log-categories]", chipsWrap],
    ["[data-log-at]", makeElement("input")], ["[data-log-plants]", makeElement("select")],
    ["[data-log-location]", makeElement("select")], ["[data-log-photos]", makeElement("input")]]) {
    doc._bySelector.set(sel, el);
  }

  const quickLog = await bootQuickLog(setupResult, doc);
  await quickLog.open();
  const boxes = chipsOf(chipsWrap);
  assert.equal(dlg._shown, true, "dialog opened");
  assert.ok(growSel.children.length >= 1, "grow options filled");
  assert.equal(growSel.value, grow.id, "active grow pre-selected");
  assert.equal(chipsWrap.children.length, 9, "category chips rendered");
  assert.equal(Object.keys(boxes).length, 9);
  // "When" is prefilled with the current datetime in the settings format
  // ("2026-09-14 20:44" default) — a datetime in a recognizable shape
  assert.match(doc._bySelector.get("[data-log-at]").value,
    /^\d{2}[./-]\d{2}[./-]\d{4} \d{1,2}:\d{2}($| (AM|PM)$)|^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    "When prefilled with now (formatted)");

  // submit minimal entry for the pre-selected grow
  form.elements.text.value = "watered 2L pH 6.3";
  boxes.watering.checked = true;
  await quickLog.submit({ preventDefault() {}, target: form });
  await new Promise((r) => setImmediate(r));

  const entries = await storage.list("logEntries");
  assert.equal(entries.length, 1, "entry persisted");
  assert.equal(entries[0].growId, grow.id);
  assert.equal(entries[0].text, "watered 2L pH 6.3");
  assert.deepEqual([...entries[0].categories], ["watering"]);
  assert.equal(entries[0].amountL, null);
  assert.equal(entries[0].plantIds.length, 0);
  assert.equal(dlg._closed, true, "dialog closed after save");
});

test("quick log: numbers + plantIds flow into the entry, photos attach via logEntryId", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  const grow = await storage.put("grows", { name: "Autumn", status: "active" });
  const plant = await storage.put("plants", { name: "Alpha", stage: "flowering", status: "growing", growId: grow.id });

  const doc = makeDocument();
  const { dlg, form, growSel, chipsWrap, fileInput } = logDialog();
  // field labels with data-log-field, mirroring the real dialog markup
  const fields = {};
  for (const f of ["amountL", "ph", "ec", "tempC", "humidityPct", "product", "dose",
    "technique", "stressLevel", "defoliationStyle", "defoliationPercent", "fermentationNote"]) {
    const label = makeElement("label");
    label.setAttribute("data-log-field", f);
    fields[f] = label;
  }
  doc._bySelector.set("[data-log-dialog]", dlg);
  for (const [sel, el] of [["[data-log-grow]", growSel], ["[data-log-categories]", chipsWrap],
    ["[data-log-at]", makeElement("input")], ["[data-log-plants]", makeElement("select")],
    ["[data-log-location]", makeElement("select")], ["[data-log-photos]", fileInput]]) {
    doc._bySelector.set(sel, el);
  }
  // the real document exposes all field labels via querySelectorAll
  doc.querySelectorAll = (sel) =>
    sel === "[data-log-field]" ? Object.values(fields) : [];

  const quickLog = await bootQuickLog(setupResult, doc);
  await quickLog.open();
  const boxes = chipsOf(chipsWrap);

  // field visibility follows the picked categories (union)
  boxes.watering.checked = true;
  boxes.feeding.checked = true;
  boxes.watering.dispatch("change");
  assert.equal(fields.amountL.hidden, false, "amount visible for watering");
  assert.equal(fields.ec.hidden, false, "ec visible for feeding");
  assert.equal(fields.dose.hidden, false, "dose visible for feeding");
  assert.equal(fields.technique.hidden, true, "technique hidden for watering/feeding");
  boxes.watering.checked = false;
  boxes.feeding.checked = false;
  boxes.training.checked = true;
  boxes.training.dispatch("change");
  assert.equal(fields.amountL.hidden, true, "amount hidden without watering/feeding");
  assert.equal(fields.technique.hidden, false, "technique visible for training");
  assert.equal(fields.stressLevel.hidden, false, "stress visible for training");
  boxes.training.checked = false;
  boxes.defoliation.checked = true;
  boxes.training.checked = false;
  boxes.defoliation.dispatch("change");
  assert.equal(fields.defoliationStyle.hidden, false, "defoliation style visible");
  assert.equal(fields.defoliationPercent.hidden, false, "defoliation percent visible");
  boxes.defoliation.checked = false;
  boxes.fermentation.checked = true;
  boxes.fermentation.dispatch("change");
  assert.equal(fields.fermentationNote.hidden, false, "fermentation note visible");
  assert.equal(fields.humidityPct.hidden, false, "humidity visible for fermentation");

  form.elements.text.value = "bloom feed";
  form.elements.amountL.value = "1.5";
  form.elements.ph.value = "6.1";
  form.elements.ec.value = "1.2";
  form.elements.tempC.value = "";
  boxes.fermentation.checked = false;
  boxes.feeding.checked = true;
  boxes.note.checked = true;
  growSel.value = grow.id;
  plantSelOptions(plantSelOf(doc), plant.id);
  // one valid JPEG-ish file stub
  const file = new setupResult.sandbox.Blob(["x"], { type: "image/jpeg" });
  file.size = 10;
  fileInput.files = [file];

  await quickLog.submit({ preventDefault() {}, target: form });
  await new Promise((r) => setImmediate(r));

  const entries = await storage.list("logEntries");
  assert.equal(entries.length, 1);
  assert.deepEqual([...entries[0].categories], ["feeding", "note"], "multi-category saved");
  assert.equal(entries[0].amountL, 1.5);
  assert.equal(entries[0].ph, 6.1);
  assert.equal(entries[0].ec, 1.2);
  assert.equal(entries[0].tempC, null);
  assert.equal(entries[0].plantIds.length, 1);
  assert.equal(entries[0].plantIds[0], plant.id);
  assert.equal(entries[0].product, null);
  assert.equal(entries[0].growId, grow.id);

  const photos = await storage.list("photos");
  assert.equal(photos.length, 1, "photo attached");
  assert.equal(photos[0].logEntryId, entries[0].id);
  assert.equal(photos[0].plantId, plant.id);
  assert.equal(photos[0].mimeType, "image/jpeg");
});

/** helper: set selectedOptions on the plant select registered in doc */
function plantSelOf(doc) {
  return doc._bySelector.get("[data-log-plants]");
}
function plantSelOptions(sel, plantId) {
  sel.selectedOptions = [{ value: plantId }];
}

test("quick log: no grow picked → error shown, nothing saved", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;

  const doc = makeDocument();
  const { dlg, form, growSel, chipsWrap, errEl } = logDialog();
  doc._bySelector.set("[data-log-dialog]", dlg);
  for (const [sel, el] of [["[data-log-grow]", growSel], ["[data-log-categories]", chipsWrap],
    ["[data-log-at]", makeElement("input")], ["[data-log-plants]", makeElement("select")],
    ["[data-log-location]", makeElement("select")], ["[data-log-photos]", makeElement("input")]]) {
    doc._bySelector.set(sel, el);
  }

  const quickLog = await bootQuickLog(setupResult, doc);
  await quickLog.open();
  const boxes = chipsOf(chipsWrap);
  growSel.value = "";
  form.elements.text.value = "no grow";
  boxes.note.checked = true;
  await quickLog.submit({ preventDefault() {}, target: form });
  await new Promise((r) => setImmediate(r));

  assert.equal(errEl.hidden, false, "error visible");
  assert.ok(String(errEl.textContent).match(/grow/i), "error names the grow");
  assert.equal((await storage.list("logEntries")).length, 0, "nothing saved");
  assert.equal(dlg._closed, undefined, "dialog stays open");
});

test("quick log: no category picked → error, nothing saved", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  const grow = await storage.put("grows", { name: "G", status: "active" });

  const doc = makeDocument();
  const { dlg, form, growSel, chipsWrap, errEl } = logDialog();

  doc._bySelector.set("[data-log-dialog]", dlg);
  for (const [sel, el] of [["[data-log-grow]", growSel], ["[data-log-categories]", chipsWrap],
    ["[data-log-at]", makeElement("input")], ["[data-log-plants]", makeElement("select")],
    ["[data-log-location]", makeElement("select")], ["[data-log-photos]", makeElement("input")]]) {
    doc._bySelector.set(sel, el);
  }

  const quickLog = await bootQuickLog(setupResult, doc);
  await quickLog.open();
  form.elements.text.value = "no category";
  await quickLog.submit({ preventDefault() {}, target: form });
  await new Promise((r) => setImmediate(r));

  assert.equal(errEl.hidden, false, "error visible");
  assert.ok(String(errEl.textContent).match(/category/i), "error names the categories");
  assert.equal((await storage.list("logEntries")).length, 0, "nothing saved");
});

test("quick log: default grow pre-selected when flagged", async () => {
  const { setup } = require("./helpers/browser-stub");
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  await storage.put("grows", { name: "Summer", status: "closed" });
  await storage.put("grows", { name: "Autumn", status: "active" });
  const flagged = await storage.put("grows", { name: "Winter", status: "planned", isDefault: true });

  const doc = makeDocument();
  const { dlg, growSel, chipsWrap } = logDialog();

  doc._bySelector.set("[data-log-dialog]", dlg);
  for (const [sel, el] of [["[data-log-grow]", growSel], ["[data-log-categories]", chipsWrap],
    ["[data-log-at]", makeElement("input")], ["[data-log-plants]", makeElement("select")],
    ["[data-log-location]", makeElement("select")], ["[data-log-photos]", makeElement("input")]]) {
    doc._bySelector.set(sel, el);
  }

  const quickLog = await bootQuickLog(setupResult, doc);
  await quickLog.open();
  assert.equal(growSel.value, flagged.id, "default-flagged grow wins over active");
});