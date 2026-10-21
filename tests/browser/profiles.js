/**
 * LeafGuru — browser check for profiles.
 *
 * Verifies the profile switcher, the profile management panel, and the
 * critical promise: the demo grow lands in ITS OWN profile and never
 * touches the user's data.
 *
 * The test runs in BOTH storage modes. A "profile" is an IndexedDB
 * database in local mode and a server workspace in server mode; the app
 * exposes one API for both (`window.LeafGuru.profileApi()`), so the
 * test talks to that and identifies profiles by NAME — server mode
 * uses UUIDs, local mode uses slugs.
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/w/node_modules/playwright-core");
const fs = require("fs");

const BASE = process.env.LEAFGURU_URL || "http://127.0.0.1:6016";
const EXECUTABLE = process.env.CHROME_PATH || "/ms-playwright/chromium-1140/chrome-linux/chrome";
const OUT = process.env.OUT_DIR || "/tmp/leafguru-shots";

const failures = [];
const jsErrors = [];

function check(label, ok, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => jsErrors.push(`pageerror: ${e.message}`));

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
  };

  /** read the profile list + the active profile, in either mode */
  const readProfiles = async () => page.evaluate(async () => {
    const api = window.LeafGuru.profileApi();
    const list = await api.list();
    const activeId = api.activeId();
    const active = list.find((p) => p.id === activeId);
    return {
      activeId,
      activeName: active ? active.name : null,
      list: list.map((p) => ({ id: p.id, name: p.name })),
    };
  });

  /** the plants the CURRENTLY ACTIVE profile holds */
  const readPlants = async () => page.evaluate(async () =>
    (await window.LeafGuru.storage.list("plants")).map((p) => p.name));

  // ---------------------------------------------------------- switcher
  console.log("\n### Topbar profile switcher");
  await go("/");

  // the mode is only known after the app has loaded and probed the
  // server - reading it before the first navigation always says "local"
  const modeInfo = await page.evaluate(() => ({
    isServer: !!window.LeafGuru.isServerMode?.(),
  })).catch(() => ({ isServer: false }));
  console.log(`  mode: ${modeInfo.isServer ? "server (profiles = workspaces)" : "local (profiles = IndexedDB)"}`);

  const sw = await page.evaluate(() => {
    const sel = document.querySelector("[data-profile-switch]");
    if (!sel) return null;
    return {
      options: [...sel.options].map((o) => ({ text: o.textContent, value: o.value })),
      value: sel.value,
    };
  });
  check("profile switcher is present", !!sw);
  check("the switcher offers a new-profile entry",
    sw?.options.some((o) => o.value === "__new__"));

  // remember the starting profile: it is the one the app starts in
  const before = await readProfiles();
  console.log("  state:", JSON.stringify(before));
  const startId = before.activeId;
  const startName = before.activeName;
  check("a profile is active at startup", !!startId, JSON.stringify(before));
  check("the switcher shows the active profile",
    sw?.options.some((o) => o.value === startId), JSON.stringify(sw?.options));

  // ------------------------------------------------- user's own data
  console.log("\n### A real plant in the starting profile");
  await page.evaluate(async () => {
    const LG = window.LeafGuru;
    LG.storage ??= new LG.LocalAdapter();
    await LG.storage.put("plants", {
      name: "My Real Plant", stage: "vegetative", status: "growing",
    });
  });
  const startPlants = await readPlants();
  check("the plant was saved in the starting profile",
    startPlants.includes("My Real Plant"), JSON.stringify(startPlants));

  // ------------------------------------------------------- demo profile
  console.log("\n### Load the demo grow (must use its own profile)");
  await go("/data/");
  const demoBtn = await page.$("[data-action='demo']");
  check("demo button exists", !!demoBtn);
  page.once("dialog", (d) => d.accept());
  await demoBtn.click();
  await page.waitForTimeout(3000);   // the page reloads into the demo profile

  const afterDemo = await readProfiles();
  const demoPlants = await readPlants();
  console.log("  state:", JSON.stringify(afterDemo));
  console.log("  plants:", JSON.stringify(demoPlants));
  check("the demo created its own profile",
    afterDemo.list.some((p) => p.name === "Demo"), JSON.stringify(afterDemo.list));
  check("the app switched into the demo profile",
    afterDemo.activeName === "Demo", JSON.stringify(afterDemo.activeName));
  check("the demo profile is not the starting profile",
    afterDemo.activeId !== startId, `${afterDemo.activeId} vs ${startId}`);
  check("the demo profile holds the demo plants",
    demoPlants.length === 6 && !demoPlants.includes("My Real Plant"),
    JSON.stringify(demoPlants));

  // ------------------------------------------- the user's data survived
  console.log("\n### Switch back — the user's data must still be there");
  await page.selectOption("[data-profile-switch]", startId);
  await page.waitForTimeout(2000);
  const backInDefault = await readProfiles();
  const backPlants = await readPlants();
  console.log("  state:", JSON.stringify(backInDefault));
  console.log("  plants:", JSON.stringify(backPlants));
  check("switching back returns to the starting profile",
    backInDefault.activeId === startId, JSON.stringify(backInDefault));
  check("the user's own plant survived the demo load",
    backPlants.includes("My Real Plant"), JSON.stringify(backPlants));
  check("the demo plants are NOT in the user's profile",
    !backPlants.includes("WW #1"), JSON.stringify(backPlants));

  // ------------------------------- loading the demo again is idempotent
  console.log("\n### Load the demo again — it must reuse the same profile");
  await go("/data/");
  const demoBtn2 = await page.$("[data-action='demo']");
  page.once("dialog", (d) => d.accept());
  await demoBtn2.click();
  await page.waitForTimeout(3000);
  const afterSecond = await readProfiles();
  const demoCount = afterSecond.list.filter((p) => p.name === "Demo").length;
  console.log("  state:", JSON.stringify(afterSecond));
  check("loading the demo twice does not create a second demo profile",
    demoCount === 1, `demo profiles: ${demoCount}`);

  // --------------------------------------------- profile management UI
  console.log("\n### Profile management panel (Data page)");
  await go("/data/");
  const panel = await page.evaluate(() => ({
    rows: document.querySelectorAll(".profile-row").length,
    names: [...document.querySelectorAll(".profile-row__name")].map((n) => n.textContent.trim()),
    activeBadges: document.querySelectorAll(".profile-badge").length,
  }));
  console.log("  panel:", JSON.stringify(panel));
  check("the profiles panel lists the profiles", panel.rows >= 2, JSON.stringify(panel));
  check("the active profile is marked", panel.activeBadges >= 1, JSON.stringify(panel));
  await page.screenshot({ path: `${OUT}/profiles-panel.png`, fullPage: true });

  // create a profile through the UI
  page.once("dialog", (d) => d.accept("Season 2027"));
  await page.click("[data-profile-new]");
  await page.waitForTimeout(1500);
  const created = await readProfiles();
  check("a new profile can be created from the UI",
    created.list.some((p) => p.name === "Season 2027"), JSON.stringify(created.list));
  const seasonId = created.list.find((p) => p.name === "Season 2027")?.id;

  // the new profile is empty
  await page.selectOption("[data-profile-switch]", seasonId);
  await page.waitForTimeout(2000);
  const empty = await page.evaluate(async () => ({
    plants: (await window.LeafGuru.storage.list("plants")).length,
    grows: (await window.LeafGuru.storage.list("grows")).length,
  }));
  check("a fresh profile is empty", empty.plants === 0 && empty.grows === 0, JSON.stringify(empty));

  // delete it again
  await go("/data/");
  page.once("dialog", (d) => d.accept());
  const delBtn = await page.$(".profile-row:has(.profile-row__name:text-is('Season 2027')) button.btn--danger");
  if (delBtn) {
    await delBtn.click();
    await page.waitForTimeout(1500);
  }
  const afterDelete = await readProfiles();
  check("a profile can be deleted again",
    !afterDelete.list.some((p) => p.name === "Season 2027"), JSON.stringify(afterDelete.list));

  await browser.close();

  console.log("\n================ SUMMARY ================");
  console.log(`checks failed: ${failures.length}`);
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  const uniq = [...new Set(jsErrors)];
  console.log(`js errors: ${uniq.length}`);
  uniq.forEach((e) => console.log(`  ${e}`));
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => { console.error("FATAL", e); process.exit(2); });
