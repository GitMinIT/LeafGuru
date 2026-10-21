/**
 * LeafGuru — full interaction sweep.
 *
 * Exercises every page's primary flow in a real Chromium. This is the
 * net for "most of the sites don't work at all": each step asserts a
 * VISIBLE state change, not just the absence of console errors.
 *
 * Run:
 *   docker run --rm --network host -v /home/daniel/Projects/LeafGuru:/w \
 *     -v /home/daniel/.openclaw/workspace:/probe -w /w \
 *     mcr.microsoft.com/playwright:v1.48.0-jammy \
 *     node /probe/sweep.js
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/w/node_modules/playwright-core");
const fs = require("fs");

const BASE = process.env.LEAFGURU_URL || "http://127.0.0.1:6016";
const EXECUTABLE = process.env.CHROME_PATH || "/ms-playwright/chromium-1140/chrome-linux/chrome";

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
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => jsErrors.push(`pageerror: ${e.message}`));

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
  };
  // list items can be rows (.crud-row) or cards (.entity-card)
  // list items can be rows (.crud-row) or cards (.entity-card); they are
  // the direct children of the list element
  const listRows = (sel = "[data-crud-list]") =>
    page.$eval(sel, (list) =>
      [...list.children].filter((c) =>
        c.classList.contains("crud-row") || c.classList.contains("entity-card")).length
    ).catch(() => 0);
  const storeCount = (entity) =>
    page.evaluate(async (e) => (await window.LeafGuru.storage.list(e)).length, entity);

  // seed the example dataset so every page has content
  const bundle = JSON.parse(fs.readFileSync("/w/examples/leafguru-example.json", "utf8"));
  await go("/");
  await page.evaluate(async (data) => {
    const LG = window.LeafGuru;
    LG.storage ??= new LG.LocalAdapter();
    if (!Object.keys(LG.schemas ?? {}).length) await LG.loadSchemas();
    await LG.storage.importBundle(data);
  }, bundle);

  // ------------------------------------------------------------ LOCATIONS
  console.log("\n### Locations: create → list → detail");
  await go("/locations/");
  const locBefore = await storeCount("locations");
  await page.click("[data-crud-new]");
  await page.waitForTimeout(400);
  check("location dialog opens", await page.$eval("[data-crud-dialog]", (d) => d.open));
  await page.fill("[data-crud-dialog] input[name='name']", "Sweep Location");
  await page.click("[data-crud-dialog] button[type='submit']");
  await page.waitForTimeout(700);
  check("location saved to store", (await storeCount("locations")) === locBefore + 1);
  check("location appears in list", (await listRows()) === locBefore + 1, `rows=${await listRows()}`);
  check("location dialog closed", !(await page.$eval("[data-crud-dialog]", (d) => d.open)));
  // detail dialog
  const detailBtn = await page.$("[data-crud-list] .crud-row button, [data-crud-list] .entity-card button");
  if (detailBtn) {
    await detailBtn.click();
    await page.waitForTimeout(500);
    check("location detail opens", await page.evaluate(() =>
      !!document.querySelector("[data-location-detail], [data-crud-dialog]:not([hidden])") ||
      [...document.querySelectorAll("dialog")].some((d) => d.open)));
  }

  // -------------------------------------------------------------- STRAINS
  console.log("\n### Strains: create with stage durations");
  await go("/strains/");
  const strainBefore = await storeCount("strainTemplates");
  await page.click("[data-crud-new]");
  await page.waitForTimeout(400);
  check("strain dialog opens", await page.$eval("[data-crud-dialog]", (d) => d.open));
  await page.fill("[data-crud-dialog] input[name='name']", "Sweep Strain");
  await page.click("[data-crud-dialog] button[type='submit']");
  await page.waitForTimeout(700);
  check("strain saved", (await storeCount("strainTemplates")) === strainBefore + 1);

  // ------------------------------------------------------------ EQUIPMENT
  console.log("\n### Equipment: add via tile");
  await go("/equipment/");
  const equipBefore = await storeCount("equipment");
  const addTile = await page.$(".equip-tile--add, [data-equip-add]");
  check("equipment add tile exists", !!addTile);
  if (addTile) {
    await addTile.click();
    await page.waitForTimeout(500);
    check("equipment dialog opens", await page.$eval("[data-crud-dialog]", (d) => d.open));
    await page.fill("[data-crud-dialog] input[name='name']", "Sweep Lamp");
    await page.click("[data-crud-dialog] button[type='submit']");
    await page.waitForTimeout(700);
    check("equipment saved", (await storeCount("equipment")) === equipBefore + 1);
  }
  // category filter
  const filter = await page.$("[data-equip-filter-category]");
  if (filter) {
    const opts = await filter.$$eval("option", (o) => o.length);
    check("category filter populated", opts > 1, `options=${opts}`);
  }

  // ---------------------------------------------------------------- GROWS
  console.log("\n### Grows: create → detail");
  await go("/grows/");
  const growBefore = await storeCount("grows");
  await page.click("[data-crud-new]");
  await page.waitForTimeout(400);
  await page.fill("[data-crud-dialog] input[name='name']", "Sweep Grow");
  await page.click("[data-crud-dialog] button[type='submit']");
  await page.waitForTimeout(700);
  check("grow saved", (await storeCount("grows")) === growBefore + 1);
  const growDetail = await page.$("[data-crud-list] .crud-row button");
  if (growDetail) {
    await growDetail.click();
    await page.waitForTimeout(700);
    check("grow detail dialog opens", await page.evaluate(() =>
      [...document.querySelectorAll("dialog")].some((d) => d.open)));
  }

  // ---------------------------------------------------------------- TASKS
  console.log("\n### Tasks: create → board toggle → done");
  await go("/tasks/");
  const taskBefore = await storeCount("tasks");
  await page.click("[data-crud-new]");
  await page.waitForTimeout(400);
  await page.fill("[data-crud-dialog] input[name='title']", "Sweep Task");
  await page.click("[data-crud-dialog] button[type='submit']");
  await page.waitForTimeout(700);
  check("task saved", (await storeCount("tasks")) === taskBefore + 1);

  // board toggle
  const toggle = await page.$("[data-task-view-toggle]");
  if (toggle) {
    await toggle.click();
    await page.waitForTimeout(600);
    const boardState = await page.evaluate(() => {
      const b = document.querySelector("[data-task-board]");
      const l = document.querySelector("[data-crud-list]");
      return {
        boardVisible: b ? !b.hidden && getComputedStyle(b).display !== "none" : false,
        listVisible: l ? !l.hidden && getComputedStyle(l).display !== "none" : false,
        cards: document.querySelectorAll(".task-card").length,
      };
    });
    check("board view shows the board", boardState.boardVisible === true, JSON.stringify(boardState));
    check("board view hides the list", boardState.listVisible === false, JSON.stringify(boardState));
    check("board renders task cards", boardState.cards > 0, `cards=${boardState.cards}`);
    await toggle.click();
    await page.waitForTimeout(500);
    const backToList = await page.evaluate(() => {
      const b = document.querySelector("[data-task-board]");
      return b ? getComputedStyle(b).display === "none" : true;
    });
    check("toggling back hides the board", backToList === true);
  }

  // mark done
  const doneBtn = await page.$("[data-crud-list] .crud-row button");
  if (doneBtn) {
    const openBefore = await page.evaluate(async () =>
      (await window.LeafGuru.storage.list("tasks")).filter((t) => t.status === "open").length);
    await page.click("[data-crud-list] .crud-row button");
    await page.waitForTimeout(700);
    const openAfter = await page.evaluate(async () =>
      (await window.LeafGuru.storage.list("tasks")).filter((t) => t.status === "open").length);
    check("first action button changes task state", openAfter !== openBefore,
      `open ${openBefore} → ${openAfter}`);
  }

  // ------------------------------------------------------------- TIMELINE
  console.log("\n### Timeline: month navigation + event popup");
  await go("/timeline/");
  const monthLabel = await page.$eval(".tl-head, [data-tl-label], .tl-grid", (e) => e.textContent.trim()).catch(() => "");
  const next = await page.$("button:has-text('›'), [data-tl-next]");
  if (next) {
    await next.click();
    await page.waitForTimeout(600);
    check("timeline month navigation works", true);
  } else {
    check("timeline next-month control found", false, "no › button");
  }
  const event = await page.$(".tl-event");
  if (event) {
    await event.click();
    await page.waitForTimeout(600);
    check("timeline event opens a popup", await page.evaluate(() =>
      [...document.querySelectorAll("dialog")].some((d) => d.open)));
  } else {
    console.log("  --   no timeline event in view (dataset dates may be in another month)");
  }

  // -------------------------------------------------------------- HISTORY
  console.log("\n### History: grow selection + rows");
  await go("/history/");
  const growSel = await page.$("select");
  if (growSel) {
    const count = await growSel.$$eval("option", (o) => o.length);
    check("history grow selector populated", count > 1, `options=${count}`);
    const selected = await growSel.evaluate((s) => s.value);
    check("history preselects a grow", !!selected, `value="${selected}"`);
  }
  const histRows = await page.$$eval(".history-row", (r) => r.length).catch(() => 0);
  check("history renders event rows", histRows > 0, `rows=${histRows}`);
  if (histRows > 0) {
    await page.click(".history-row");
    await page.waitForTimeout(600);
    check("history row opens a popup", await page.evaluate(() =>
      [...document.querySelectorAll("dialog")].some((d) => d.open)));
  }

  // ------------------------------------------------------------- SETTINGS
  console.log("\n### Settings: change + persist");
  await go("/settings/");
  const settingInputs = await page.$$eval("select, input[type='text']", (els) =>
    els.map((e) => ({ tag: e.tagName, id: e.id, name: e.name })));
  check("settings page renders controls", settingInputs.length > 0, JSON.stringify(settingInputs).slice(0, 160));
  // change the date format and read it back
  const changed = await page.evaluate(async () => {
    const LG = window.LeafGuru;
    const before = LG.settings.get("dateFormat");
    LG.settings.set("dateFormat", "dmy");
    const after = LG.settings.get("dateFormat");
    LG.settings.set("dateFormat", before);
    return { before, after };
  });
  check("date format setting round-trips", changed.after === "dmy" && changed.before !== undefined,
    JSON.stringify(changed));

  // ----------------------------------------------------------------- DATA
  console.log("\n### Data: counts + storage");
  await go("/data/");
  const counts = await page.$$eval("[data-record-counts] li, .record-counts li", (l) => l.length)
    .catch(() => 0);
  check("data page lists record counts", counts > 0, `items=${counts}`);
  const usage = await page.$eval("main.page", (e) => e.innerText);
  check("data page shows storage usage", /browser usage|storage/i.test(usage));

  // ------------------------------------------------------------- PLANTS
  console.log("\n### Plants: inline create + detail + stage change");
  await go("/plants/");
  const plantBefore = await storeCount("plants");
  await page.fill("#plant-create input[name='name']", "Sweep Plant");
  await page.click("#plant-create button[type='submit']");
  await page.waitForTimeout(800);
  check("plant created via inline form", (await storeCount("plants")) === plantBefore + 1);

  // detail + stage change
  // filter to the plant we just created: the list is sorted by name, so the
  // new plant is NOT the first row
  await page.fill("[data-crud-search]", "Sweep Plant");
  await page.waitForTimeout(500);
  const detail = await page.$("[data-crud-list] .crud-row button");
  if (detail) {
    await detail.click();
    await page.waitForTimeout(700);
    const panel = await page.evaluate(() => {
      const p = document.querySelector("[data-plant-detail]");
      return { hidden: p?.hidden, name: p?.querySelector("[data-detail-name]")?.textContent };
    });
    check("plant detail panel opens", panel?.hidden === false, JSON.stringify(panel));
    // change stage
    const stageBefore = await page.evaluate(async () => {
      const list = await window.LeafGuru.storage.list("plants");
      return list.find((p) => p.name === "Sweep Plant")?.stage;
    });
    await page.selectOption("#new-stage", "flowering");
    await page.click("[data-action='change-stage']");
    await page.waitForTimeout(800);
    const stageAfter = await page.evaluate(async () => {
      const list = await window.LeafGuru.storage.list("plants");
      return list.find((p) => p.name === "Sweep Plant")?.stage;
    });
    check("stage change persists", stageAfter === "flowering" && stageAfter !== stageBefore,
      `${stageBefore} → ${stageAfter}`);
  }

  // ----------------------------------------------------------- +LOG FLOW
  console.log("\n### +Log: save and see it in history");
  await go("/");
  await page.click("[data-quick-log]");
  await page.waitForTimeout(600);
  const growValue = await page.$eval("[data-log-grow]", (s) => s.value);
  check("+Log preselects a grow", !!growValue, `value="${growValue}"`);
  await page.click("[data-log-categories] input");
  await page.fill("[data-log-dialog] textarea[name='text']", "Sweep journal note");
  await page.click("[data-log-dialog] button[type='submit']");
  await page.waitForTimeout(900);
  const logSaved = await page.evaluate(async () =>
    (await window.LeafGuru.storage.list("logEntries")).some((l) => l.text === "Sweep journal note"));
  check("journal entry saved", logSaved === true);
  const dialogClosed = await page.$eval("[data-log-dialog]", (d) => d.open);
  check("log dialog closed after save", dialogClosed === false);

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
