/** Unit tests: uuid helper (secure + insecure context paths). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uuid: uses crypto.randomUUID when available", async () => {
  const { window } = await setup();
  assert.ok(V4.test(window.LeafGuru.uuid()));
});

test("uuid: getRandomValues fallback works without randomUUID (insecure context)", async () => {
  const { window } = await setup();
  const saved = window.crypto.randomUUID;
  delete window.crypto.randomUUID;
  try {
    for (let i = 0; i < 50; i++) assert.ok(V4.test(window.LeafGuru.uuid()), "iteration " + i);
  } finally {
    window.crypto.randomUUID = saved;
  }
});

test("uuid: fallback unique across calls", async () => {
  const { window } = await setup();
  const saved = window.crypto.randomUUID;
  delete window.crypto.randomUUID;
  try {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(window.LeafGuru.uuid());
    assert.equal(set.size, 100);
  } finally {
    window.crypto.randomUUID = saved;
  }
});