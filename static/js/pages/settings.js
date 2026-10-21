/**
 * LeafGuru — Settings page: language, date format, timezone.
 * Writes to the browser-local settings store; the preview shows a live
 * example of the chosen format/timezone combination.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);

    const settings = window.LeafGuru.settings;

    // timezone options: local + common IANA zones
    const tzSel = $("[data-setting='timezone']");
    const zones = ["local", "UTC", "Europe/Berlin", "Europe/London", "Europe/Madrid",
      "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"];
    const current = settings.get("timezone");
    tzSel.replaceChildren();
    for (const zone of zones) {
      tzSel.append(new Option(
        zone === "local" ? t("settings.localTimezone") : zone, zone));
    }
    if (zones.includes(current)) tzSel.value = current;
    else tzSel.append(new Option(current, current)); // custom zone kept

    // language options: everything shipped in i18n/
    const langSel = $("[data-setting='language']");
    for (const opt of [...langSel.children]) {
      if (opt.value === settings.get("language")) opt.selected = true;
    }

    const dateSel = $("[data-setting='dateFormat']");
    dateSel.value = settings.get("dateFormat");
    const hourSel = $("[data-setting='hourFormat']");
    hourSel.value = settings.get("hourFormat");

    const preview = $("[data-settings-preview]");
    const status = $("[data-settings-status]");
    const EXAMPLE = "2026-09-14T18:30:00Z";
    function updatePreview() {
      const s = {
        language: langSel.value,
        dateFormat: dateSel.value,
        hourFormat: hourSel.value,
        timezone: tzSel.value
      };
      preview.textContent = `${t("settings.example")}: `
        + `${window.LeafGuru.format.date("2026-09-14", s)} · `
        + `${window.LeafGuru.format.dateTime(EXAMPLE, s)}`;
    }
    for (const sel of [langSel, dateSel, hourSel, tzSel]) sel.addEventListener("change", updatePreview);
    updatePreview();

    $("[data-settings-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      settings.set("language", langSel.value);
      settings.set("dateFormat", dateSel.value);
      settings.set("hourFormat", hourSel.value);
      settings.set("timezone", tzSel.value);
      // apply immediately: pages render once on load — reload closes the gap
      location.reload();
    });

    $("[data-settings-reset]").addEventListener("click", () => {
      const next = settings.reset();
      langSel.value = next.language;
      dateSel.value = next.dateFormat;
      hourSel.value = next.hourFormat;
      tzSel.value = next.timezone;
      location.reload();
    });
  });
})();