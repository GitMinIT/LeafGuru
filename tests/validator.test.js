/** Unit tests: draft-07 subset validator (schemas are the fixture source). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./helpers/browser-stub");

test("validator loads with schemas", async () => {
  const { window } = await setup();
  assert.ok(window.LeafGuru.validator);
  assert.ok(window.LeafGuru.schemas["plant.schema.json"]);
});

test("valid location record passes", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["location.schema.json"];
  const res = window.LeafGuru.validator.validate({
    id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d",
    name: "Growbox", type: "indoor", active: true,
    size: { widthCm: 100, depthCm: 60 }
  }, schema);
  assert.equal(res.valid, true, JSON.stringify(res.errors));
});

test("invalid location type rejected with path", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["location.schema.json"];
  const res = window.LeafGuru.validator.validate(
    { id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "x", type: "greenhouse", active: true },
    schema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path.includes("type")));
});

test("missing required field reported", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["location.schema.json"];
  const res = window.LeafGuru.validator.validate({ type: "indoor" }, schema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path.endsWith(".name") || e.path.endsWith(".id")));
});

test("unknown property rejected (additionalProperties false)", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["location.schema.json"];
  const res = window.LeafGuru.validator.validate({
    id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "x", type: "indoor",
    active: true, hacker: true
  }, schema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path.includes("hacker")));
});

test("bad uuid format rejected", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["plant.schema.json"];
  const res = window.LeafGuru.validator.validate({
    id: "not-a-uuid", name: "p", stage: "planned", status: "growing"
  }, schema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path === "$.id"));
});

test("invalid stage enum rejected", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["plant.schema.json"];
  const res = window.LeafGuru.validator.validate({
    id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "p",
    stage: "dancing", status: "growing"
  }, schema);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path === "$.stage"));
});

test("nullable fields accept null (stageHint)", async () => {
  const { window } = await setup();
  const schema = window.LeafGuru.schemas["task.schema.json"];
  const res = window.LeafGuru.validator.validate({
    id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d",
    title: "Feed", status: "open", stageHint: null
  }, schema);
  assert.equal(res.valid, true, JSON.stringify(res.errors));
});

test("validateBundle: complete empty bundle passes", async () => {
  const { window } = await setup();
  const res = window.LeafGuru.validator.validateBundle({
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: "2026-09-13T12:00:00Z" },
    locations: [], equipment: [], strainTemplates: [], plants: []
  }, window.LeafGuru.schemas);
  assert.equal(res.valid, true, JSON.stringify(res.errors));
});

test("validateBundle: wrong app or version rejected", async () => {
  const { window } = await setup();
  const base = { locations: [], equipment: [], strainTemplates: [], plants: [] };
  for (const meta of [{ app: "Other", schemaVersion: 1 }, { app: "LeafGuru", schemaVersion: 99 }]) {
    const res = window.LeafGuru.validator.validateBundle({ meta, ...base }, window.LeafGuru.schemas);
    assert.equal(res.valid, false, JSON.stringify(meta));
  }
});

test("validateBundle: entity mapped by name, record validated", async () => {
  const { window } = await setup();
  const bundle = {
    meta: { app: "LeafGuru", schemaVersion: 1, exportedAt: "2026-09-13T12:00:00Z" },
    locations: [], equipment: [], strainTemplates: [],
    plants: [{ id: "9a1d6b34-1c2d-4e5f-9a8b-3c2b1a0f9e8d", name: "p", stage: "dancing", status: "growing" }]
  };
  const res = window.LeafGuru.validator.validateBundle(bundle, window.LeafGuru.schemas);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path.startsWith("$.plants[0].stage")));
});