/**
 * LeafGuru — settings store (browser-local, phase 1).
 *
 * Settings are UI preferences — they live in localStorage (not in the
 * data bundle): language, date format, timezone. The Data page keeps
 * import/export; settings survive both.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const KEY = "leafguru.settings";
  const DEFAULTS = {
    language: "en",            // i18n locale code, file at js/i18n/<code>.json
    dateFormat: "iso",        // iso | dmy | mdy | long
    hourFormat: "h24",        // h24 | h12
    timezone: "local"          // "local" | IANA zone (e.g. "Europe/Berlin")
  };
  const DATE_FORMATS = ["iso", "dmy", "mdy", "long"];
  const HOUR_FORMATS = ["h24", "h12"];

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      return { ...DEFAULTS, ...Object.fromEntries(
        Object.entries(raw ?? {}).filter(([k]) => k in DEFAULTS)) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  window.LeafGuru.settings = {
    DEFAULTS,
    DATE_FORMATS,
    HOUR_FORMATS,
    all: read,
    get(key) { return read()[key]; },
    set(key, value) {
      const next = { ...read() };
      if (!(key in DEFAULTS)) return next;
      next[key] = value;
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    },
    /** reset to defaults */
    reset() {
      localStorage.removeItem(KEY);
      return { ...DEFAULTS };
    }
  };
})();