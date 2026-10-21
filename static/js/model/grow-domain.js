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
     * The default grow for form prefill: the isDefault-flagged grow wins,
     * then the first active grow, else null.
     */
    defaultGrowId(grows, { fallbackActive = true } = {}) {
      const list = grows ?? [];
      return list.find((g) => g.isDefault)?.id
        ?? (fallbackActive ? list.find((g) => g.status === "active")?.id : null)
        ?? null;
    },
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
    },

    /**
     * Harvest statistics of a grow from its plants. Considers plants that
     * reached harvest (status harvested/dried/fermented/cured or stage
     * harvest+). Returns
     * { plantCount, totalYieldG, avgYieldG, withYield, totalBudG,
     *   totalLeafG, totalSugarLeafG, totalStemG, costPerG: [...] }
     * — costPerG divides the grow's equipment costs per currency by the
     * total yield. Returns null when no plant was harvested yet.
     */
    harvestSummary({ plants, equipmentList, growId }) {
      const harvested = (plants ?? []).filter((p) => {
        if (p.growId !== growId) return false;
        return this.isHarvested(p);
      });
      if (!harvested.length) return null;
      const withYield = harvested.filter((p) => p.harvestYieldG != null);
      const totalYieldG = withYield.reduce((sum, p) => sum + p.harvestYieldG, 0);
      const sumOf = (key) =>
        harvested.reduce((sum, p) => sum + (p[key] != null ? p[key] : 0), 0);
      const costs = this.costSummary(equipmentList, growId);
      const costPerG = totalYieldG > 0
        ? costs.map((c) => ({ ...c, costPerG: c.total / totalYieldG }))
        : [];
      return {
        plantCount: harvested.length,
        totalYieldG,
        avgYieldG: withYield.length ? totalYieldG / withYield.length : null,
        withYield: withYield.length,
        totalBudG: sumOf("budG"),
        totalLeafG: sumOf("leafG"),
        totalSugarLeafG: sumOf("sugarLeafG"),
        totalStemG: sumOf("stemG"),
        costPerG
      };
    },

    /** did this plant reach harvest? (status or stage moved past flowering) */
    isHarvested(plant) {
      return ["harvested", "dried", "fermented", "cured"].includes(plant.status)
        || ["harvest", "drying", "fermented", "cured"].includes(plant.stage);
    },

    /**
     * Actual stage durations per stage over a grow's plants, from closed
     * StageLog entries (enteredAt → leftAt, whole days). Returns
     * { stage: { count, avgDays, minDays, maxDays } } for stages with data,
     * ordered by the plant lifecycle.
     */
    stageAverages({ plants, stageLogs, growId }) {
      const plantIds = new Set((plants ?? [])
        .filter((p) => p.growId === growId).map((p) => p.id));
      const byStage = {};
      for (const log of stageLogs ?? []) {
        if (!plantIds.has(log.plantId) || log.leftAt == null) continue;
        const days = Math.floor(
          (new Date(log.leftAt) - new Date(log.enteredAt)) / 86400000);
        if (days < 0) continue;
        (byStage[log.stage] ??= []).push(days);
      }
      const ORDER = ["germinating", "seedling", "vegetative", "flowering", "harvest", "drying", "fermented", "cured"];
      const out = {};
      for (const stage of ORDER) {
        const days = byStage[stage];
        if (!days?.length) continue;
        const total = days.reduce((a, b) => a + b, 0);
        out[stage] = {
          count: days.length,
          avgDays: total / days.length,
          minDays: Math.min(...days),
          maxDays: Math.max(...days)
        };
      }
      return out;
    }
  };
})();