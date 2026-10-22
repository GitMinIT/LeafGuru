/**
 * LeafGuru — UI screenshot capture.
 * Renders each page (with seeded demo data) so the design can be reviewed.
 *
 * Run:
 *   docker run --rm --network host -v /home/daniel/Projects/LeafGuru:/w \
 *     -v /home/daniel/.openclaw/workspace:/probe -w /w \
 *     mcr.microsoft.com/playwright:v1.48.0-jammy \
 *     node /probe/screenshots.js
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/w/node_modules/playwright-core");
const fs = require("fs");

const BASE = process.env.LEAFGURU_URL || "http://127.0.0.1:6016";
const EXECUTABLE = process.env.CHROME_PATH || "/ms-playwright/chromium-1140/chrome-linux/chrome";
const OUT = process.env.OUT_DIR || "/tmp/leafguru-shots";

const PAGES = [
  ["/", "today"],
  ["/dashboard/", "dashboard"],
  ["/grows/", "grows"],
  ["/plants/", "plants"],
  ["/locations/", "locations"],
  ["/equipment/", "equipment"],
  ["/strains/", "strains"],
  ["/tasks/", "tasks"],
  ["/timeline/", "timeline"],
  ["/history/", "history"],
  ["/settings/", "settings"],
  ["/data/", "data"],
];

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  // --- seed demo data so pages are not empty --------------------------
  // Use the project example dataset: it is schema-valid by construction.
  const bundle = JSON.parse(fs.readFileSync("/w/examples/leafguru-example.json", "utf8"));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const seeded = await page.evaluate(async (data) => {
    const LG = window.LeafGuru;
    LG.storage ??= new LG.LocalAdapter();
    if (!Object.keys(LG.schemas ?? {}).length) await LG.loadSchemas();
    await LG.storage.importBundle(data);
    const counts = {};
    for (const name of ["grows", "locations", "equipment", "strainTemplates",
                        "plants", "tasks", "logEntries", "measurements", "stageLogs"]) {
      counts[name] = (await LG.storage.list(name)).length;
    }
    return counts;
  }, bundle);
  console.log("seeded:", JSON.stringify(seeded));

  // --- capture ---------------------------------------------------------
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`shot ${name}`);
  }

  // --- dialog + picker shots ------------------------------------------
  await page.goto(`${BASE}/plants/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const editBtn = await page.$("[data-crud-list] .crud-row button");
  if (editBtn) {
    await page.click("[data-crud-list] .crud-row button:has-text('Edit')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/dialog-edit.png` });
    console.log("shot dialog-edit");
    const dateInput = await page.$("[data-plant-edit] input[data-date-input]");
    if (dateInput) {
      await dateInput.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/date-picker.png` });
      console.log("shot date-picker");
    }
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.click("[data-quick-log]");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/dialog-log.png` });
  console.log("shot dialog-log");

  // mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/plants/`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${OUT}/mobile-plants.png`, fullPage: true });
  console.log("shot mobile-plants");

  await browser.close();
  console.log(`\nerrors: ${errors.length}`);
  [...new Set(errors)].forEach((e) => console.log(`  ${e}`));
}

run().catch((e) => { console.error("FATAL", e); process.exit(2); });
