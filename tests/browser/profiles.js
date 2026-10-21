/**
 * LeafGuru — browser check for profiles.
 *
 * Verifies the profile switcher, the profile management panel, and the
 * critical promise: the demo grow lands in ITS OWN profile and never
 * touches the user's data.
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

  // ---------------------------------------------------------- switcher
  console.log("\n### Topbar profile switcher");
  await go("/");
  const sw = await page.evaluate(() => {
    const sel = document.querySelector("[data-profile-switch]");
    if (!sel) return null;
    return {
      options: [...sel.options].map((o) => ({ text: o.textContent, value: o.value })),
      value: sel.value,
    };
  });
  check("profile switcher is present", !!sw);
  check("switcher lists the default profile",
    sw?.options.some((o) => o.value === "default"), JSON.stringify(sw?.options));
  check("switcher offers a new-profile entry",
    sw?.options.some((o) => o.value === "__new__"));

  // ------------------------------------------------- user's own data
  console.log("\n### A real plant in the default profile");
  await page.evaluate(async () => {
    const LG = window.LeafGuru;
    LG.storage ??= new LG.LocalAdapter();
    await LG.storage.put("plants", {
      name: "My Real Plant", stage: "vegetative", status: "growing",
    });
  });

  // ------------------------------------------------------- demo profile
  console.log("\n### Load the demo grow (must use its own profile)");
  await go("/data/");
  const demoBtn = await page.$("[data-action='demo']");
  check("demo button exists", !!demoBtn);
  page.once("dialog", (d) => d.accept());
  await demoBtn.click();
  await page.waitForTimeout(2500);   // the page reloads into the demo profile

  const afterDemo = await page.evaluate(async () => ({
    activeProfile: window.LeafGuru.profiles.activeId(),
    activeName: window.LeafGuru.profiles.active()?.name,
    profiles: window.LeafGuru.profiles.list().map((p) => p.id),
    plants: (await window.LeafGuru.storage.list("plants")).map((p) => p.name),
  }));
  console.log("  state:", JSON.stringify(afterDemo));
  check("the demo created its own profile", afterDemo.profiles.includes("demo"),
    JSON.stringify(afterDemo.profiles));
  check("the app switched into the demo profile", afterDemo.activeProfile === "demo",
    afterDemo.activeProfile);
  check("the demo profile holds the demo plants",
    afterDemo.plants.length === 6 && !afterDemo.plants.includes("My Real Plant"),
    JSON.stringify(afterDemo.plants));

  // ------------------------------------------- the user's data survived
  console.log("\n### Switch back — the user's data must still be there");
  await page.selectOption("[data-profile-switch]", "default");
  await page.waitForTimeout(2000);
  const backInDefault = await page.evaluate(async () => ({
    activeProfile: window.LeafGuru.profiles.activeId(),
    plants: (await window.LeafGuru.storage.list("plants")).map((p) => p.name),
  }));
  console.log("  state:", JSON.stringify(backInDefault));
  check("switching back returns to the default profile", backInDefault.activeProfile === "default");
  check("the user's own plant survived the demo load",
    backInDefault.plants.includes("My Real Plant"), JSON.stringify(backInDefault.plants));
  check("the demo plants are NOT in the default profile",
    !backInDefault.plants.includes("WW #1"), JSON.stringify(backInDefault.plants));

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
  await page.waitForTimeout(1200);
  const created = await page.evaluate(() =>
    window.LeafGuru.profiles.list().map((p) => p.id));
  check("a new profile can be created from the UI", created.includes("season-2027"),
    JSON.stringify(created));

  // the new profile is empty
  await page.selectOption("[data-profile-switch]", "season-2027");
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
    await page.waitForTimeout(1200);
  }
  const afterDelete = await page.evaluate(() => window.LeafGuru.profiles.list().map((p) => p.id));
  check("a profile can be deleted again", !afterDelete.includes("season-2027"),
    JSON.stringify(afterDelete));

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
