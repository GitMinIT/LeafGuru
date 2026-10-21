/**
 * LeafGuru — strain catalog.
 *
 * A bundled catalogue of well-known strains (name, breeder, genotype,
 * potency, aroma) so a user can pick "White Widow" instead of typing
 * one in by hand. The catalogue is NOT stored in IndexedDB — it is a
 * static, read-only reference that is loaded on demand and converted
 * into a real strain template when the user picks an entry.
 *
 * Source data: https://github.com/kushyapp/cannabis-dataset (MIT),
 * bundled as static/js/data/strain-catalog.json (see
 * tools/build-strain-catalog.js).
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const CATALOG_URL = "/static/js/data/strain-catalog.json";

  // typical grow profile per genotype — matches tools/build-strain-catalog.js
  const PROFILES = {
    indica: { seedling: 14, vegetative: 24, flowering: 56, height: 120 },
    sativa: { seedling: 14, vegetative: 35, flowering: 63, height: 220 },
    hybrid: { seedling: 14, vegetative: 30, flowering: 56, height: 160 },
    unknown: { seedling: 14, vegetative: 28, flowering: 56, height: 140 },
  };

  let cache = null;        // array of catalog entries
  let loading = null;

  /** fetch + expand the columnar catalogue into objects (once) */
  async function load() {
    if (cache) return cache;
    if (loading) return loading;
    loading = (async () => {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`strain catalog unavailable (${res.status})`);
      const data = await res.json();
      const cols = data.columns ?? [];
      const rows = data.rows ?? [];
      cache = rows.map((row) => {
        const o = {};
        cols.forEach((c, i) => { o[c] = row[i]; });
        o.featured = false;
        return o;
      });
      // the featured block comes first in the file — mark it
      const featuredCount = data.featuredCount ?? 0;
      for (let i = 0; i < Math.min(featuredCount, cache.length); i++) cache[i].featured = true;
      return cache;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  /** lower-cased haystack for fast searching */
  function haystack(entry) {
    return `${entry.name} ${entry.breeder ?? ""} ${entry.genotype}`.toLowerCase();
  }

  /**
   * Search the catalogue.
   * @param {string} query free text; empty returns the featured set
   * @param {number} limit max results
   */
  async function search(query = "", limit = 60) {
    const all = await load();
    const q = query.trim().toLowerCase();
    if (!q) {
      // empty query: show the curated "popular" strains first
      const featured = all.filter((e) => e.featured);
      return (featured.length ? featured : all).slice(0, limit);
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const entry of all) {
      const hay = haystack(entry);
      let score = 0;
      let ok = true;
      for (const term of terms) {
        const at = hay.indexOf(term);
        if (at < 0) { ok = false; break; }
        // name matches outrank breeder matches; prefix matches outrank
        // mid-string matches
        if (entry.name.toLowerCase().startsWith(term)) score += 100;
        else if (entry.name.toLowerCase().includes(term)) score += 40;
        else score += 10;
      }
      if (!ok) continue;
      if (entry.featured) score += 25;
      scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    return scored.slice(0, limit).map((s) => s.entry);
  }

  /** exact lookup by name (case-insensitive) */
  async function byName(name) {
    const all = await load();
    const n = String(name ?? "").trim().toLowerCase();
    return all.find((e) => e.name.toLowerCase() === n) ?? null;
  }

  /**
   * Turn a catalogue entry into a LeafGuru strain template record.
   * Stage durations and expected height come from the genotype profile.
   */
  function toTemplate(entry, { now = new Date().toISOString() } = {}) {
    const profile = PROFILES[entry.genotype] ?? PROFILES.unknown;
    const traits = [];
    if (entry.thc != null) traits.push(`THC ${entry.thc}%`);
    if (entry.cbd != null) traits.push(`CBD ${entry.cbd}%`);
    if (entry.characteristics) traits.push(entry.characteristics);
    return {
      id: window.LeafGuru.uuid(),
      name: entry.name,
      breeder: entry.breeder ?? null,
      genotype: entry.genotype ?? "unknown",
      stageDurations: {
        seedling: profile.seedling,
        vegetative: profile.vegetative,
        flowering: profile.flowering,
      },
      expectedHeightCm: profile.height,
      characteristics: traits.join(" · ") || null,
      notes: "From the built-in strain catalog.",
      createdAt: now,
      updatedAt: now,
    };
  }

  window.LeafGuru.strainCatalog = { load, search, byName, toTemplate, PROFILES, CATALOG_URL };
})();
