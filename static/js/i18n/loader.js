/**
 * LeafGuru — i18n loader.
 *
 * All UI strings live in static/js/i18n/<locale>.json (currently en.json).
 * Usage: await LeafGuru.i18n.init() → LeafGuru.t("nav.dashboard")
 * Placeholders: t("plant.stageChangedTo", { stage: "Flowering" })
 */
(function () {
  "use strict";

  let strings = {};
  let locale = "en";

  function lookup(obj, dottedKey) {
    return dottedKey.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  function interpolate(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] !== undefined ? params[name] : `{${name}}`);
  }

  window.LeafGuru = window.LeafGuru || {};
  window.LeafGuru.i18n = {
    async init(localeCode = "en") {
      locale = localeCode;
      const res = await fetch(`/static/js/i18n/${locale}.json`);
      strings = await res.json();
    },
    /** translate with dotted key + optional {placeholder} params */
    t(key, params) {
      const value = lookup(strings, key);
      if (value === undefined) return key;
      if (typeof value !== "string") return value;
      return interpolate(value, params);
    },
    get locale() { return locale; }
  };
})();