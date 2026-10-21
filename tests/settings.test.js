/** Unit tests: settings store + date formatting per settings. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/browser-stub");

test("settings: defaults, set/get, invalid keys ignored, reset", async () => {
  const { window } = await setup();
  const s = window.LeafGuru.settings;
  assert.deepEqual({ ...s.all() }, { ...s.DEFAULTS });
  assert.equal(s.get("language"), "en");
  assert.equal(s.get("dateFormat"), "iso");
  assert.equal(s.get("hourFormat"), "h24");

  s.set("dateFormat", "dmy");
  s.set("language", "de");
  assert.equal(s.get("dateFormat"), "dmy");
  assert.equal(s.get("language"), "de");
  // persists in localStorage
  const raw = JSON.parse(window.localStorage.getItem("leafguru.settings"));
  assert.equal(raw.dateFormat, "dmy");

  // unknown keys are ignored
  const next = s.set("nonsense", "x");
  assert.equal("nonsense" in next, false);

  // corrupt JSON falls back to defaults
  window.localStorage.setItem("leafguru.settings", "{not json");
  assert.equal(s.get("dateFormat"), "iso");

  s.set("dateFormat", "long");
  const reset = s.reset();
  assert.deepEqual({ ...reset }, { ...s.DEFAULTS });
  assert.equal(window.localStorage.getItem("leafguru.settings"), null);
});

test("format.date: iso / dmy / mdy per settings", async () => {
  const { window } = await setup();
  const fmt = window.LeafGuru.format;
  assert.equal(fmt.date("2026-09-14"), "2026-09-14", "default iso");
  assert.equal(fmt.date("2026-09-14", { dateFormat: "dmy" }), "14.09.2026");
  assert.equal(fmt.date("2026-09-14", { dateFormat: "mdy" }), "09/14/2026");
  assert.equal(fmt.date("2026-09-14", { dateFormat: "long" }), "September 14, 2026");
  assert.equal(fmt.date(null), "–");
  // full ISO datetimes format their date part
  assert.equal(fmt.date("2026-09-14T18:30:00Z", { dateFormat: "dmy" }), "14.09.2026");
});

test("format.dateTime: timezone + 12/24h", async () => {
  const { window } = await setup();
  const fmt = window.LeafGuru.format;
  const iso = "2026-09-14T18:30:00Z";
  // UTC shows the same moment
  assert.equal(fmt.dateTime(iso, { dateFormat: "iso", timezone: "UTC", hourFormat: "h24" }), "2026-09-14, 18:30");
  // Berlin (UTC+2 in September) shifts by two hours
  assert.equal(fmt.dateTime(iso, { dateFormat: "iso", timezone: "Europe/Berlin", hourFormat: "h24" }), "2026-09-14, 20:30");
  // 12-hour rendering
  assert.equal(fmt.dateTime(iso, { dateFormat: "iso", timezone: "UTC", hourFormat: "h12" }), "2026-09-14, 6:30 PM");
  assert.equal(fmt.dateTime("2026-09-14T06:30:00Z", { dateFormat: "iso", timezone: "UTC", hourFormat: "h12" }), "2026-09-14, 6:30 AM");
  assert.equal(fmt.dateTime("2026-09-14T00:30:00Z", { dateFormat: "iso", timezone: "UTC", hourFormat: "h12" }), "2026-09-14, 12:30 AM");
  assert.equal(fmt.dateTime("2026-09-14T12:30:00Z", { dateFormat: "iso", timezone: "UTC", hourFormat: "h12" }), "2026-09-14, 12:30 PM");
  // New York (UTC-4 in September) shifts back
  assert.equal(fmt.dateTime(iso, { dateFormat: "iso", timezone: "America/New_York", hourFormat: "h24" }), "2026-09-14, 14:30");
  // date can shift across zones: 23:30 UTC → next day in Berlin
  assert.equal(fmt.date("2026-09-14T23:30:00Z", { dateFormat: "iso", timezone: "Europe/Berlin" }),
    "2026-09-15");
});

test("format.inputDateTime/parseInput round-trip (all formats, both hour formats)", async () => {
  const { window } = await setup();
  const fmt = window.LeafGuru.format;
  const iso = "2026-09-14T18:30:00Z";
  const norm = (v) => (v ?? "").replace(/\.000Z$/, "Z"); // Date.UTC builds carry .000

  for (const dateFormat of ["iso", "dmy", "mdy", "long"]) {
    for (const hourFormat of ["h24", "h12"]) {
      for (const zone of ["UTC", "Europe/Berlin"]) {
        const s = { dateFormat, hourFormat, timezone: zone };
        const shown = fmt.inputDateTime(iso, s);
        // every produced representation round-trips to the same instant
        const back = norm(fmt.parseInput(shown, s));
        assert.equal(back, iso,
          `${dateFormat}/${hourFormat}/${zone}: "${shown}" → ${back}`);
      }
    }
  }
  // 12h edge: noon and midnight keep their AM/PM mapping
  assert.equal(norm(fmt.parseInput(fmt.inputDateTime("2026-09-14T12:05:00Z", { dateFormat: "dmy", hourFormat: "h12", timezone: "UTC" }),
    { dateFormat: "dmy", hourFormat: "h12", timezone: "UTC" })), "2026-09-14T12:05:00Z");
  // datetime-local style still accepted
  assert.equal(norm(fmt.parseInput("2026-09-14T18:30", { timezone: "UTC" })), "2026-09-14T18:30:00Z");
  // date-only input anchors at noon UTC
  assert.equal(norm(fmt.parseInput("14.09.2026", { dateFormat: "dmy" })), "2026-09-14T12:00:00Z");
  // wall-clock in the target zone: 20:30 Berlin = 18:30Z
  assert.equal(norm(fmt.parseInput("14.09.2026 20:30", { dateFormat: "dmy", hourFormat: "h24", timezone: "Europe/Berlin" })),
    "2026-09-14T18:30:00Z");
});

test("i18n init honors the stored language setting", async () => {
  const { window, fetched } = await setup();
  window.LeafGuru.settings.set("language", "en");
  await window.LeafGuru.i18n.init();
  assert.ok(fetched.some((u) => u.includes("/en.json")), "loads the settings locale");
});