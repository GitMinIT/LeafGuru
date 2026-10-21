/**
 * LeafGuru — plant domain logic (stage transitions, location moves,
 * measurements). Pure functions on top of StorageAdapter — tested in
 * tests/plant-domain.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const STAGES = ["planned", "germinating", "seedling", "vegetative", "flowering", "harvest", "drying", "fermented", "cured"];

  window.LeafGuru.plantDomain = {
    stages: STAGES,

    /**
     * Change a plant's stage: closes the open StageLog entry, appends a new
     * one, updates the plant. Returns { plant, stageLogs } (not persisted —
     * caller persists via adapter).
     */
    applyStageChange({ plant, stageLogs, newStage, at = null }) {
      if (!STAGES.includes(newStage)) throw new Error(`unknown stage: ${newStage}`);
      const now = at ?? new Date().toISOString();
      const logs = stageLogs ?? [];
      const open = logs.find((l) => l.plantId === plant.id && l.leftAt == null);
      const updatedLogs = logs.map((l) =>
        l.id === open?.id && l.leftAt == null ? { ...l, leftAt: now } : l);
      updatedLogs.push({
        id: window.LeafGuru.uuid(),
        plantId: plant.id,
        stage: newStage,
        enteredAt: now,
        leftAt: null,
        createdAt: now,
        updatedAt: now
      });
      const updatedPlant = { ...plant, stage: newStage, updatedAt: now };
      return { plant: updatedPlant, stageLogs: updatedLogs };
    },

    /**
     * Move a plant between locations. Records a LocationChange and updates
     * the plant. from/to may be null (unassigned).
     */
    applyLocationChange({ plant, fromLocationId = undefined, toLocationId, reason = "", at = null }) {
      const now = at ?? new Date().toISOString();
      const current = plant.locationId ?? null;
      const target = toLocationId ?? null;
      if (current === target) return { plant, locationChange: null };
      const locationChange = {
        id: window.LeafGuru.uuid(),
        plantId: plant.id,
        fromLocationId: current,
        toLocationId: target,
        changedAt: now,
        reason: reason || "",
        createdAt: now,
        updatedAt: now
      };
      return { plant: { ...plant, locationId: target, updatedAt: now }, locationChange };
    },

    /** add a measurement for a plant */
    buildMeasurement({ plant, type, value, unit, note = "", at = null }) {
      const now = at ?? new Date().toISOString();
      return {
        id: window.LeafGuru.uuid(),
        plantId: plant.id,
        type, value, unit, note,
        measuredAt: now,
        createdAt: now,
        updatedAt: now
      };
    },

    /** days since a timestamp (whole days) */
    daysSince(iso, now = null) {
      if (!iso) return null;
      const start = new Date(iso);
      const end = now ? new Date(now) : new Date();
      return Math.floor((end - start) / 86400000);
    },

    /** open stage log for a plant (or null) */
    openStage(stageLogs, plantId) {
      return (stageLogs ?? []).find((l) => l.plantId === plantId && l.leftAt == null) ?? null;
    },

    /** stage logs for a plant, chronological */
    timelineFor(stageLogs, plantId) {
      return (stageLogs ?? [])
        .filter((l) => l.plantId === plantId)
        .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
    },

    /**
     * records to delete along with a plant (its stage logs, measurements,
     * location changes, photos). Pure — the caller persists the deletions.
     */
    cascadeRecords({ plant, stageLogs = [], measurements = [], locationChanges = [], photos = [] }) {
      return {
        stageLogs: (stageLogs ?? []).filter((l) => l.plantId === plant.id),
        measurements: (measurements ?? []).filter((m) => m.plantId === plant.id),
        locationChanges: (locationChanges ?? []).filter((c) => c.plantId === plant.id),
        photos: (photos ?? []).filter((p) => p.plantId === plant.id)
      };
    },

    /**
     * Progress through the current stage vs. the strain template's
     * expected duration. Returns null when unknown (no open log or no
     * expected duration for the stage), else
     * { day, expected, remaining, overdue } — day is whole days since
     * the stage was entered, remaining may be negative (past schedule),
     * overdue is true when remaining < 0.
     */
    stageProgress({ plant, stageLogs, strainTemplate = null, now = null }) {
      const open = this.openStage(stageLogs ?? [], plant.id);
      if (!open) return null;
      const expected = strainTemplate?.stageDurations?.[plant.stage];
      if (expected == null) return null;
      const day = this.daysSince(open.enteredAt, now ?? new Date().toISOString());
      const remaining = expected - day;
      return { day, expected, remaining, overdue: remaining < 0 };
    }
  };
})();