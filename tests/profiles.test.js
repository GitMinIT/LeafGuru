/**
 * Profiles: independent data sets in one browser.
 *
 * A profile is an own IndexedDB database. The default profile keeps the
 * legacy database name so existing installs keep their data untouched.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { setup } = require("./helpers/browser-stub");

/** boot the profile store + local adapter in a fresh sandbox */
async function boot(extraScripts = []) {
  const setupResult = await setup();
  const target = { ...setupResult.window };
  const sandbox = new Proxy(target, {
    get(t, k) { return t[k]; },
    set(t, k, v) { t[k] = v; return true; }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const scripts = [
    "static/js/model/profile-store.js",
    "static/js/adapter/storage-adapter.js",
    "static/js/adapter/local-adapter.js",
    ...extraScripts,
  ];
  for (const rel of scripts) {
    vm.runInContext(fs.readFileSync(rel, "utf8"), sandbox, { filename: rel });
  }
  return sandbox.window;
}

test("profiles: the default profile always exists and is active", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  assert.equal(p.activeId(), "default");
  assert.ok(p.list().some((x) => x.id === "default"));
  assert.equal(p.get("default").name, "Default");
});

test("profiles: the default profile keeps the legacy database name", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  // existing installs must keep their data — no migration
  assert.equal(p.dbNameFor("default"), "leafguru");
  assert.equal(p.dbNameFor("demo"), "leafguru-demo");
  assert.notEqual(p.dbNameFor("default"), p.dbNameFor("demo"));
});

test("profiles: create, list, rename and switch", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;

  const created = p.create("2026 Season");
  assert.equal(created.id, "2026-season", "id is derived from the name");
  assert.ok(p.list().some((x) => x.id === created.id));

  // creating the same name twice returns the same profile
  const again = p.create("2026 Season");
  assert.equal(again.id, created.id, "no duplicate profile for the same name");

  p.setActive(created.id);
  assert.equal(p.activeId(), created.id);
  assert.equal(p.active().name, "2026 Season");

  p.rename(created.id, "Season 2026");
  assert.equal(p.get(created.id).name, "Season 2026");
});

test("profiles: switching to an unknown profile is rejected", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  assert.throws(() => p.setActive("nope"), /unknown profile/);
  // the active profile is unchanged
  assert.equal(p.activeId(), "default");
});

test("profiles: the default profile cannot be removed", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  assert.throws(() => p.remove("default"), /cannot be removed/);
  // removeWithData is async -> it rejects rather than throwing
  await assert.rejects(() => p.removeWithData("default"), /cannot be removed/);
});

test("profiles: removing a profile resets the active profile to default", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  const created = p.create("Temp");
  p.setActive(created.id);
  p.remove(created.id);
  assert.equal(p.activeId(), "default");
  assert.ok(!p.list().some((x) => x.id === created.id));
});

test("profiles: each profile gets its own database and its own data", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  const demo = p.ensure("Demo", { id: p.DEMO_ID });

  // a plant in the default profile
  const defaultStorage = new w.LeafGuru.LocalAdapter();
  await defaultStorage.put("plants", { name: "In Default", stage: "seedling", status: "growing" });

  // the same plant in the demo profile
  const demoStorage = new w.LeafGuru.LocalAdapter({ profileId: demo.id });
  await demoStorage.put("plants", { name: "In Demo", stage: "seedling", status: "growing" });

  const defaultPlants = await defaultStorage.list("plants");
  const demoPlants = await demoStorage.list("plants");
  assert.equal(defaultPlants.length, 1);
  assert.equal(defaultPlants[0].name, "In Default");
  assert.equal(demoPlants.length, 1);
  assert.equal(demoPlants[0].name, "In Demo", "profiles hold separate records");
});

test("profiles: the adapter follows the active profile by default", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  const demo = p.ensure("Demo", { id: p.DEMO_ID });
  p.setActive(demo.id);

  const storage = new w.LeafGuru.LocalAdapter();
  assert.equal(storage.profileId, demo.id, "adapter picks up the active profile");
  assert.equal(storage.dbName, "leafguru-demo");

  await storage.put("plants", { name: "Auto", stage: "seedling", status: "growing" });
  const demoStorage = new w.LeafGuru.LocalAdapter({ profileId: demo.id });
  assert.equal((await demoStorage.list("plants")).length, 1);
});

test("profiles: the demo seed lands in the demo profile, not the user's", async () => {
  const w = await boot(["static/js/model/demo-data.js"]);
  const LG = w.LeafGuru;

  // a real plant in the default profile must survive the demo load
  const defaultStorage = new LG.LocalAdapter();
  await defaultStorage.put("plants", { name: "Real Plant", stage: "seedling", status: "growing" });

  const result = await LG.demoData.seedDemoProfile({ switchTo: false });
  assert.equal(result.profile.id, LG.profiles.DEMO_ID);
  assert.equal(result.switched, false, "no switch when asked not to");

  // the user's data is untouched
  const after = await defaultStorage.list("plants");
  assert.equal(after.length, 1);
  assert.equal(after[0].name, "Real Plant", "the demo did NOT touch the user's data");

  // the demo profile holds the demo data
  const demoStorage = new LG.LocalAdapter({ profileId: LG.profiles.DEMO_ID });
  const demoPlants = await demoStorage.list("plants");
  assert.equal(demoPlants.length, 6, "the demo profile has the demo plants");
});

test("profiles: duplicating a profile copies its data into a new profile", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;

  // source profile with data
  const source = p.create("Season A");
  const srcStorage = new w.LeafGuru.LocalAdapter({ profileId: source.id });
  await srcStorage.put("plants", { name: "Plant A", stage: "seedling", status: "growing" });
  await srcStorage.put("tasks", { title: "Task A", status: "open" });

  const copy = await p.duplicate(source.id, "Season B");
  assert.ok(copy.id.startsWith("season-b"), "new id derived from the name");
  assert.notEqual(copy.id, source.id);

  // the copy has the data
  const copyStorage = new w.LeafGuru.LocalAdapter({ profileId: copy.id });
  const copyPlants = await copyStorage.list("plants");
  const copyTasks = await copyStorage.list("tasks");
  assert.equal(copyPlants.length, 1);
  assert.equal(copyPlants[0].name, "Plant A");
  assert.equal(copyTasks.length, 1);
  assert.equal(copyTasks[0].title, "Task A");

  // the source is untouched
  const srcAfter = await srcStorage.list("plants");
  assert.equal(srcAfter.length, 1, "the source keeps its data");
});

test("profiles: duplicating twice creates distinct profiles", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  const source = p.create("Season");
  const a = await p.duplicate(source.id, "Copy");
  const b = await p.duplicate(source.id, "Copy");
  assert.notEqual(a.id, b.id, "the second copy gets a distinct id");
  assert.ok(p.list().some((x) => x.id === a.id));
  assert.ok(p.list().some((x) => x.id === b.id));
});

test("profiles: duplicating an unknown profile fails", async () => {
  const w = await boot();
  const p = w.LeafGuru.profiles;
  await assert.rejects(() => p.duplicate("nope", "Copy"), /unknown profile/);
});
