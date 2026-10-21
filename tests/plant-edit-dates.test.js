/**
 * Regression: the reported sex-change validation error.
 * Editing ONLY the sex of a plant with existing germinationDate and
 * harvestedAt must not corrupt the dates (they used to become full ISO
 * datetimes, because bare data-date-input inputs were treated as
 * datetime fields) — and the change must land in the edit protocol.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");
const { bootPage } = require("./helpers/dom-stub");

test("plant edit: sex-only change keeps dates clean + protocolled", async () => {
  const setupResult = await setup();
  const storage = new setupResult.window.LeafGuru.LocalAdapter();
  setupResult.window.LeafGuru.storage = storage;
  const loc = await storage.put("locations", { name: "Box", type: "indoor", active: true });
  const plant = await storage.put("plants", {
    name: "Vera", strainTemplateId: null, customStrain: null, sex: "unknown",
    germinationDate: "2026-08-27", stage: "cured", status: "cured",
    locationId: loc.id, harvestYieldG: 42.5, harvestedAt: "2026-01-20"
  });

  const { doc } = await bootPage(setupResult, "static/js/pages/plants.js");
  const form = doc.querySelector("[data-plant-edit] form");
  form.dataset.plantId = plant.id;
  const germinationInput = form.elements["germinationDate"];
  const harvestedInput = doc.querySelector("#edit-harvested");
  // mirror the template attributes (stub inputs are auto-created bare)
  germinationInput.setAttribute("data-date-input", "");
  harvestedInput.setAttribute("data-date-input", "");

  // the page fills date inputs through dateInput — check the shapes
  setupResult.window.LeafGuru.dateInput.set(germinationInput, "2026-08-27");
  setupResult.window.LeafGuru.dateInput.set(harvestedInput, "2026-01-20");
  assert.equal(germinationInput.value, "2026-08-27", "date-only field keeps the plain date");
  assert.equal(harvestedInput.value, "2026-01-20", "no phantom time part");

  form.elements["name"].value = "Vera";
  form.elements["customStrain"].value = "";
  form.elements["notes"].value = "";
  doc.querySelector("#edit-sex").value = "female";
  doc.querySelector("#edit-status").value = "cured";
  doc.querySelector("#edit-template").value = "";
  doc.querySelector("#edit-grow").value = "";
  doc.querySelector("#edit-location").value = "";

  form.dispatch("submit", { target: form, preventDefault() {} });
  await new Promise((r) => setImmediate(r));

  const updated = await storage.get("plants", plant.id);
  assert.equal(updated.sex, "female");
  assert.equal(updated.germinationDate, "2026-08-27", "date stayed a plain date");
  assert.equal(updated.harvestedAt, "2026-01-20", "harvest date stayed a plain date");

  // change protocol: the sex change is recorded
  const edits = await storage.editsOf("plants", plant.id);
  const last = edits.at(-1);
  const sexChange = last.changes.find((c) => c.key === "sex");
  assert.ok(sexChange, "sex change protocolled");
  assert.equal(sexChange.from, "unknown");
  assert.equal(sexChange.to, "female");
});