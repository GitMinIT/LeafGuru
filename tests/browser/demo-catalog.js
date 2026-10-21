/**
 * LeafGuru — browser check for the demo grow + strain catalog.
 *
 * Run:
 *   docker run --rm --network host -v /home/daniel/Projects/LeafGuru:/w \
 *     -v /home/daniel/.openclaw/workspace:/probe -w /w \
 *     mcr.microsoft.com/playwright:v1.48.0-jammy \
 *     node /probe/demo-catalog-check.js
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
  page.on("response", (r) => { if (r.status() >= 400) jsErrors.push(`http ${r.status()} ${r.url()}`); });

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
  };

  // ---------------------------------------------------------- DEMO GROW
  console.log("\n### Data page: load demo grow");
  await go("/data/");
  const demoBtn = await page.$("[data-action='demo']");
  check("demo button exists", !!demoBtn);

  // accept the confirm dialog
  page.once("dialog", (d) => d.accept());
  await demoBtn.click();
  await page.waitForTimeout(1500);

  const status = await page.$eval("[data-demo-status]", (e) => e.textContent.trim()).catch(() => "");
  check("demo status shows a record count", /records/i.test(status), `status="${status}"`);

  const counts = await page.evaluate(async () => {
    const s = window.LeafGuru.storage;
    const out = {};
    for (const e of ["grows", "locations", "equipment", "strainTemplates", "plants",
      "stageLogs", "measurements", "locationChanges", "tasks", "logEntries"]) {
      out[e] = (await s.list(e)).length;
    }
    return out;
  });
  console.log("  counts:", JSON.stringify(counts));
  check("demo grow has plants", counts.plants >= 5, `plants=${counts.plants}`);
  check("demo grow has equipment", counts.equipment >= 8, `equipment=${counts.equipment}`);
  check("demo grow has tasks", counts.tasks >= 8, `tasks=${counts.tasks}`);
  check("demo grow has journal entries", counts.logEntries >= 8, `logs=${counts.logEntries}`);
  check("demo grow has stage history", counts.stageLogs >= 15, `stageLogs=${counts.stageLogs}`);
  check("demo grow has measurements", counts.measurements >= 10, `measurements=${counts.measurements}`);

  await page.screenshot({ path: `${OUT}/demo-data.png`, fullPage: true });

  // the dashboard must show the demo content
  await go("/");
  const dashText = await page.$eval("main.page", (e) => e.innerText);
  check("dashboard shows demo stats", /Demo Grow/i.test(dashText), dashText.slice(0, 120).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/demo-dashboard.png`, fullPage: true });

  // plants page
  await go("/plants/");
  const plantRows = await page.$$eval("[data-crud-list] .crud-row", (r) => r.length);
  check("plants page lists the demo plants", plantRows >= 5, `rows=${plantRows}`);
  await page.screenshot({ path: `${OUT}/demo-plants.png`, fullPage: true });

  // tasks page
  await go("/tasks/");
  const taskRows = await page.$$eval("[data-crud-list] .crud-row", (r) => r.length);
  check("tasks page lists the demo tasks", taskRows >= 5, `rows=${taskRows}`);

  // history page (needs a grow)
  await go("/history/");
  const histText = await page.$eval("main.page", (e) => e.innerText);
  check("history shows the demo journal", /Watered|Water the tent|pistils/i.test(histText),
    histText.slice(0, 140).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/demo-history.png`, fullPage: true });

  // --------------------------------------------------------- STRAIN CATALOG
  console.log("\n### Strains page: catalog picker");
  await go("/strains/");
  const toggle = await page.$("[data-catalog-toggle]");
  check("catalog toggle exists", !!toggle);

  if (toggle) {
    await toggle.click();
    await page.waitForTimeout(1200);

    const panel = await page.evaluate(() => {
      const p = document.querySelector("[data-catalog-panel]");
      return { hidden: p?.hidden, rows: document.querySelectorAll(".catalog-row").length,
        status: document.querySelector("[data-catalog-status]")?.textContent.trim() };
    });
    check("catalog panel opens", panel.hidden === false, JSON.stringify(panel));
    check("catalog shows results without a query", panel.rows > 0, `rows=${panel.rows}`);
    check("catalog is not in an error state", !/unavailable/i.test(panel.status ?? ""), panel.status);
    await page.screenshot({ path: `${OUT}/demo-catalog.png`, fullPage: true });

    // search for a specific strain
    await page.fill("[data-catalog-search]", "white widow");
    await page.waitForTimeout(700);
    const searchRows = await page.$$eval(".catalog-row", (rows) =>
      rows.map((r) => r.querySelector(".catalog-row__name")?.textContent));
    check("search finds White Widow", searchRows.some((n) => n === "White Widow"),
      JSON.stringify(searchRows.slice(0, 5)));
    await page.screenshot({ path: `${OUT}/demo-catalog-search.png`, fullPage: true });

    // pick it → the create dialog should be prefilled
    const useBtn = await page.$(".catalog-row button");
    if (useBtn) {
      await useBtn.click();
      await page.waitForTimeout(700);
      const prefilled = await page.evaluate(() => {
        const form = document.querySelector("[data-crud-dialog] form");
        const dialog = document.querySelector("[data-crud-dialog]");
        return {
          open: dialog?.open,
          name: form?.elements["name"]?.value,
          breeder: form?.elements["breeder"]?.value,
          seedling: form?.elements["stageDurations__seedling"]?.value,
          vegetative: form?.elements["stageDurations__vegetative"]?.value,
          flowering: form?.elements["stageDurations__flowering"]?.value,
          height: form?.elements["expectedHeightCm"]?.value,
          genotype: form?.elements["genotype"]?.value,
        };
      });
      console.log("  prefilled:", JSON.stringify(prefilled));
      check("picking a catalog entry opens the create dialog", prefilled.open === true);
      check("the name is prefilled", !!prefilled.name, `name="${prefilled.name}"`);
      check("the breeder is prefilled", !!prefilled.breeder, `breeder="${prefilled.breeder}"`);
      check("stage durations are prefilled", !!prefilled.seedling && !!prefilled.vegetative && !!prefilled.flowering,
        JSON.stringify(prefilled));
      check("expected height is prefilled", !!prefilled.height, `height=${prefilled.height}`);
      check("genotype is prefilled", !!prefilled.genotype, `genotype=${prefilled.genotype}`);
      await page.screenshot({ path: `${OUT}/demo-catalog-prefilled.png` });

      // saving must create a real strain template
      const before = await page.evaluate(async () =>
        (await window.LeafGuru.storage.list("strainTemplates")).length);
      await page.click("[data-crud-dialog] button[type='submit']");
      await page.waitForTimeout(900);
      const after = await page.evaluate(async () =>
        (await window.LeafGuru.storage.list("strainTemplates")).length);
      check("the prefilled strain is saved", after === before + 1, `${before} → ${after}`);
      const err = await page.$eval("[data-crud-error]", (e) => (e.hidden ? "" : e.textContent.trim())).catch(() => "");
      check("no validation error on save", err === "", err);
    }
  }

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
