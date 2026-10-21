/**
 * LeafGuru — date input binding.
 *
 * Date/datetime inputs across the app carry `data-date-input` /
 * `data-datetime-input`. A single delegated module formats values per
 * user settings on fill and parses them back to ISO on read — settings
 * changes apply globally without touching page code.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  function isDateOnly(input) {
    // bare data-date-input attribute (dataset value "") or explicit "date"
    return "dateInput" in (input.dataset ?? {})
      || input.dataset?.dateInput === "date";
  }

  window.LeafGuru.dateInput = {
    isDateOnly,

    /** fill an input with a formatted value (null = leave empty) */
    set(input, iso = null) {
      const f = window.LeafGuru.format;
      if (iso == null || iso === "") {
        input.value = "";
        return;
      }
      if (isDateOnly(input)) {
        input.value = f.date(iso);
      } else {
        input.value = f.inputDateTime(iso);
      }
    },

    /** read the input back → YYYY-MM-DD (date input) or ISO (datetime) */
    parse(input) {
      const raw = input.value?.trim();
      if (!raw) return null;
      const f = window.LeafGuru.format;
      const iso = f.parseInput(raw);
      if (!iso) return null;
      // date-only inputs keep the plain date shape the schemas expect
      return isDateOnly(input) ? iso.slice(0, 10) : iso;
    }
  };
})();