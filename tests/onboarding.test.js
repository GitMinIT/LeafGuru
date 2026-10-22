/** Unit tests: the onboarding logic (when to greet, and what to say). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("isFirstRun is true only for a completely empty app", async () => {
  const { window } = await setup();
  const o = window.LeafGuru.onboarding;
  assert.equal(o.isFirstRun({ plants: [], grows: [], locations: [] }), true);
  // a location alone means the user has started
  assert.equal(o.isFirstRun({ plants: [], grows: [], locations: [{ id: "l1" }] }), false);
  assert.equal(o.isFirstRun({ plants: [{ id: "p1" }], grows: [], locations: [] }), false);
  assert.equal(o.isFirstRun({ plants: [], grows: [{ id: "g1" }], locations: [] }), false);
  // no arguments -> still a first run
  assert.equal(o.isFirstRun(), true);
});

test("hasSeenWelcome is false until the welcome is remembered", async () => {
  const { window } = await setup();
  const o = window.LeafGuru.onboarding;
  assert.equal(o.hasSeenWelcome(), false);
  o.rememberWelcome();
  assert.equal(o.hasSeenWelcome(), true);
});

test("there are four steps, and each one points somewhere real", async () => {
  const { window } = await setup();
  const steps = window.LeafGuru.onboarding.STEPS;
  assert.equal(steps.length, 4);
  const ids = new Set();
  for (const step of steps) {
    assert.ok(step.id, "a step needs an id");
    assert.ok(!ids.has(step.id), `duplicate step id: ${step.id}`);
    ids.add(step.id);
    assert.ok(step.icon, "a step needs an icon");
    assert.ok(step.titleKey, "a step needs a title key");
    assert.ok(step.textKey, "a step needs a text key");
    assert.ok(step.href?.startsWith("/"), `step ${step.id} must link into the app`);
  }
  // the steps are distinct places
  const hrefs = steps.map((s) => s.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "each step links somewhere different");
});

test("every step's i18n key exists in the English strings", async () => {
  const { window } = await setup();
  const t = (k) => window.LeafGuru.i18n.t(k);
  for (const step of window.LeafGuru.onboarding.STEPS) {
    // the loader returns the key itself when a string is missing
    assert.notEqual(t(step.titleKey), step.titleKey, `missing: ${step.titleKey}`);
    assert.notEqual(t(step.textKey), step.textKey, `missing: ${step.textKey}`);
  }
});
