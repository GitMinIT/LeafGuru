/**
 * LeafGuru — date formatting per user settings (dateFormat + timezone +
 * hourFormat). Pure: takes the settings object, returns formatted strings.
 * ISO strings in the data stay canonical (UTC); display is converted.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * Convert an ISO date/date-time to the target timezone and return the
   * components { year, month, day, hours, minutes } (all strings, 24h).
   */
  function partsIn(iso, timezone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const zone = timezone && timezone !== "local" ? timezone : undefined;
    try {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      });
      const map = {};
      for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
      return {
        year: map.year, month: map.month, day: map.day,
        hours: map.hour === "24" ? "00" : map.hour, minutes: map.minute
      };
    } catch {
      return null;
    }
  }

  /** format a date (YYYY-MM-DD or ISO datetime) per settings.dateFormat */
  function date(iso, settings = window.LeafGuru.settings?.all?.() ?? {}) {
    if (!iso) return "–";
    const p = partsIn(typeof iso === "string" && iso.length === 10 ? `${iso}T12:00:00Z` : iso,
      settings.timezone);
    if (!p) return String(iso);
    switch (settings.dateFormat) {
      case "dmy": return `${p.day}.${p.month}.${p.year}`;
      case "mdy": return `${p.month}/${p.day}/${p.year}`;
      case "long": {
        const d = new Date(typeof iso === "string" && iso.length === 10 ? `${iso}T12:00:00Z` : iso);
        try {
          return new Intl.DateTimeFormat("en", {
            timeZone: settings.timezone && settings.timezone !== "local" ? settings.timezone : undefined,
            year: "numeric", month: "long", day: "numeric"
          }).format(d);
        } catch { return `${p.year}-${p.month}-${p.day}`; }
      }
      default: return `${p.year}-${p.month}-${p.day}`; // iso
    }
  }

  /** "6 PM" (h12) or "18" (h24) — the meridiem rides on the hours token */
  function hoursDisplay(hours, hourFormat) {
    if (hourFormat !== "h12") return hours;
    const h = Number(hours);
    return `${(h + 11) % 12 + 1} ${h >= 12 ? "PM" : "AM"}`;
  }

  /** format a datetime per settings (date + time in target zone) */
  function dateTime(iso, settings = window.LeafGuru.settings?.all?.() ?? {}) {
    if (!iso) return "–";
    const p = partsIn(iso, settings.timezone);
    if (!p) return String(iso);
    const shown = hoursDisplay(p.hours, settings.hourFormat);
    // h12: "14.09.2026, 6:30 PM" — meridiem after the minutes
    if (settings.hourFormat === "h12") {
      const hour = Number(p.hours);
      return `${date(iso, settings)}, ${(hour + 11) % 12 + 1}:${p.minutes} ${hour >= 12 ? "PM" : "AM"}`;
    }
    return `${date(iso, settings)}, ${p.hours}:${p.minutes}`;
  }

  /**
   * Format "now" (or a given ISO datetime) for the Log dialog's "When"
   * input: "14.09.2026 20:30" / "09/14/2026 8:30 PM". The dialog uses a
   * text input (a real browser renders datetime-local in its own locale,
   * ignoring LeafGuru settings).
   */
  function inputDateTime(iso = null, settings = window.LeafGuru.settings?.all?.() ?? {}) {
    const isoStr = iso ?? new Date().toISOString();
    const p = partsIn(isoStr, settings.timezone);
    if (!p) return "";
    if (settings.hourFormat === "h12") {
      const hour = Number(p.hours);
      return `${date(isoStr, settings)} ${(hour + 11) % 12 + 1}:${p.minutes} ${hour >= 12 ? "PM" : "AM"}`;
    }
    return `${date(isoStr, settings)} ${p.hours}:${p.minutes}`;
  }

  /** offset (ms east of UTC) of an IANA zone at a given instant */
  function tzOffsetMs(instantMs, zone) {
    const p = partsIn(new Date(instantMs).toISOString(), zone);
    if (!p) return 0;
    return Date.UTC(p.year, p.month - 1, p.day, p.hours, p.minutes) - instantMs;
  }

  /**
   * Parse a user-entered "When" value back to an ISO string (UTC),
   * interpreting wall-clock time in the settings timezone. Accepts every
   * format the module produces (all dateFormats × both hour formats) —
   * and the old datetime-local shape.
   */
  function parseInput(raw, settings = window.LeafGuru.settings?.all?.() ?? {}) {
    if (!raw) return null;
    const text = String(raw).trim();
    if (!text) return null;

    const DATE = "(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})|(\\d{1,2})/(\\d{1,2})/(\\d{4})|([A-Za-z]+) (\\d{1,2}),? (\\d{4})";
    const TIME = "(\\d{1,2}):(\\d{2})(?:\\s?(AM|PM))?";
    const full = new RegExp(`^\\s*(?:${DATE})[T, ]+${TIME}\\s*$`, "i").exec(text);
    const dateOnly = new RegExp(`^\\s*(?:${DATE})\\s*$`, "i").exec(text);

    const MONTHS = ["january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"];
    const pick = (m) => {
      // m[1..3] iso | m[4..6] dmy | m[7..9] mdy | m[10..12] long ("September 14, 2026")
      if (m[1]) return { year: m[1], month: m[2], day: m[3] };
      if (m[4]) return { year: m[6], month: m[5], day: m[4] };
      if (m[7]) return { year: m[9], month: m[7], day: m[8] };
      const month = MONTHS.indexOf((m[10] ?? "").toLowerCase());
      return month >= 0 ? { year: m[12], month: String(month + 1), day: m[11] } : null;
    };

    let parts, hours, minutes;
    if (full) {
      const dateP = pick(full);
      if (!dateP) return null;
      const hourRaw = Number(full[13]);
      const meridiem = full[15] ?? "";
      if (/PM/i.test(meridiem) && hourRaw < 12) hours = hourRaw + 12;
      else if (/AM/i.test(meridiem) && hourRaw === 12) hours = 0;
      else hours = hourRaw;
      minutes = Number(full[14] ?? 0);
      return toIso(dateP.year, dateP.month, dateP.day, String(hours), minutes, settings);
    }
    if (dateOnly) {
      const p = pick(dateOnly);
      return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 12)).toISOString();
    }
    return null;
  }

  /** wall-clock components (in the settings zone) → ISO instant */
  function toIso(year, month, day, hours, minutes, settings = window.LeafGuru.settings?.all?.() ?? {}) {
    const y = Number(year), mo = Number(month), d = Number(day);
    const h = Number(hours), mi = Number(minutes);
    if ([y, mo, d, h, mi].some(Number.isNaN) || mi > 59 || h > 23) return null;
    const zone = settings.timezone && settings.timezone !== "local" ? settings.timezone : null;
    if (!zone) {
      const local = new Date(y, mo - 1, d, h, mi);
      return Number.isNaN(local.getTime()) ? null : local.toISOString();
    }
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    const offset1 = tzOffsetMs(asUtc, zone);
    const offset2 = tzOffsetMs(asUtc - offset1, zone);
    const result = new Date(asUtc - offset2).toISOString();
    return Number.isNaN(new Date(result).getTime()) ? null : result;
  }

  /** "now" in the settings timezone, formatted for the "When" input */
  function nowLocal(settings = window.LeafGuru.settings?.all?.() ?? {}) {
    return inputDateTime(null, settings);
  }

  window.LeafGuru.format = { date, dateTime, inputDateTime, parseInput, nowLocal, partsIn, toIso };
})();