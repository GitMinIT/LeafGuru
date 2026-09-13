/**
 * LeafGuru — grow domain logic (aggregations over linked entities).
 * Pure functions on top of StorageAdapter records — tested in
 * tests/grow-domain.test.js (extended for costs). Complements the
 * plant/task/location domain modules.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  window.LeafGuru.growDomain = {
    /**
     * Cost summary of a grow from its equipment: sums cost per currency
     * (equipment.growId === grow.id). Returns [] or
     * [{ currency, total, count }]. availableEverywhere equipment is NOT
     * counted — it is shared infrastructure, not grow-specific.
     */
    costSummary(equipmentList, growId) {
      const byCurrency = new Map();
      for (const eq of equipmentList ?? []) {
        if (eq.growId !== growId || eq.cost == null) continue;
        const currency = eq.currency ?? "";
        const entry = byCurrency.get(currency) ?? { currency, total: 0, count: 0 };
        entry.total += eq.cost;
        entry.count++;
        byCurrency.set(currency, entry);
      }
      return [...byCurrency.values()].sort((a, b) =>
        b.total - a.total || a.currency.localeCompare(b.currency));
    },

    /** equipment linked to a grow (by growId; excludes shared items) */
    equipmentOf(equipmentList, growId) {
      return (equipmentList ?? []).filter((e) => e.growId === growId);
    }
  };
})();