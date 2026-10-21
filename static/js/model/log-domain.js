/**
 * LeafGuru — log domain (journal entries on a grow).
 * Pure builders used by the quick-add dialog; tested in
 * tests/log-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const CATEGORIES = [
    "watering", "feeding", "training", "defoliation",
    "treatment", "observation", "fermentation", "note", "other"
  ];

  /**
   * Which optional fields each category shows in the +Log dialog.
   * The dialog shows the union of all picked categories.
   */
  const CATEGORY_FIELDS = {
    watering: ["amountL", "ph", "ec", "tempC"],
    feeding: ["amountL", "ph", "ec", "tempC", "product", "dose"],
    training: ["technique", "stressLevel"],
    defoliation: ["defoliationStyle", "defoliationPercent", "stressLevel"],
    treatment: ["amountL", "product", "dose", "stressLevel"],
    observation: ["tempC", "humidityPct"],
    fermentation: ["tempC", "humidityPct", "fermentationNote"],
    note: [],
    other: []
  };

  window.LeafGuru.logDomain = {
    categories: CATEGORIES,
    categoryFields: CATEGORY_FIELDS,

    /** union of optional fields for the picked categories */
    fieldsFor(categories) {
      const cats = categories ?? [];
      return CATEGORIES.filter((c) => cats.includes(c))
        .flatMap((c) => CATEGORY_FIELDS[c] ?? []);
    },

    /**
     * Build a LogEntry record from dialog input. `categories` is a
     * non-empty array; numbers arrive as strings from the form — empty
     * becomes null, invalid becomes null. Returns the record (not
     * persisted; caller puts it via the adapter).
     */
    buildEntry({ growId, at = null, categories, text,
      amountL = null, ph = null, ec = null, tempC = null,
      humidityPct = null, product = null, dose = null,
      technique = null, stressLevel = null,
      defoliationStyle = null, defoliationPercent = null,
      fermentationNote = null,
      plantIds = [], locationId = null }) {
      if (!growId) throw new Error("log entry requires a growId");
      const cats = (categories ?? []).filter((c) => CATEGORIES.includes(c));
      if (!cats.length) throw new Error("log entry requires at least one category");
      const trimmed = (text ?? "").trim();
      if (!trimmed) throw new Error("log entry requires text");
      const num = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const parsed = Number(v);
        return Number.isNaN(parsed) ? null : parsed;
      };
      const str = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
      const now = new Date().toISOString();
      return {
        id: window.LeafGuru.uuid(),
        growId,
        at: at ?? now,
        categories: cats,
        text: trimmed,
        amountL: num(amountL),
        ph: num(ph),
        ec: num(ec),
        tempC: num(tempC),
        humidityPct: num(humidityPct),
        product: str(product),
        dose: str(dose),
        technique: str(technique),
        stressLevel: (stressLevel && ["low", "medium", "high"].includes(stressLevel)) ? stressLevel : null,
        defoliationStyle: str(defoliationStyle),
        defoliationPercent: num(defoliationPercent),
        fermentationNote: str(fermentationNote),
        plantIds: (plantIds ?? []).filter(Boolean),
        locationId: locationId ?? null,
        createdAt: now,
        updatedAt: now
      };
    },

    /** normalized categories of an entry (multi → [..], legacy single → [category]) */
    categoriesOf(entry) {
      const cats = entry?.categories?.filter(Boolean);
      if (cats?.length) return cats;
      const single = entry?.category;
      return single ? [single] : [];
    },

    /** summary line for lists: numbers appended to the text */
    summaryLine(entry) {
      const parts = [entry.text];
      if (entry.amountL != null) parts.push(`${entry.amountL} L`);
      if (entry.ph != null) parts.push(`pH ${entry.ph}`);
      if (entry.ec != null) parts.push(`EC ${entry.ec}`);
      if (entry.tempC != null) parts.push(`${entry.tempC} °C`);
      if (entry.humidityPct != null) parts.push(`${entry.humidityPct} %`);
      if (entry.product) parts.push(String(entry.product));
      if (entry.dose) parts.push(String(entry.dose));
      if (entry.technique) parts.push(String(entry.technique));
      if (entry.defoliationStyle) parts.push(String(entry.defoliationStyle));
      if (entry.defoliationPercent != null) parts.push(`${entry.defoliationPercent}%`);
      if (entry.stressLevel) parts.push(`${entry.stressLevel} stress`);
      return parts.join(" · ");
    }
  };
})();