/**
 * LeafGuru — location domain logic (cross-entity back-references).
 * Pure functions on top of StorageAdapter records — tested in
 * tests/location-domain.test.js. Complements plant/task domain.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  window.LeafGuru.locationDomain = {
    /** id of the location an equipment item is currently assigned to (open assignment), or null */
    currentLocationId(equipment) {
      const open = (equipment.locationAssignments ?? []).find((a) => !a.to);
      return open?.locationId ?? null;
    },

    /** equipment currently at a location (open assignment, or availableEverywhere) */
    equipmentAt(equipmentList, locationId) {
      return (equipmentList ?? []).filter((e) =>
        e.availableEverywhere || this.currentLocationId(e) === locationId);
    },

    /** plants currently at a location */
    plantsAt(plantsList, locationId) {
      return (plantsList ?? []).filter((p) => p.locationId === locationId);
    },

    /** grows using a location (grow.locationIds[] back-reference) */
    growsUsing(growsList, locationId) {
      return (growsList ?? []).filter((g) => (g.locationIds ?? []).includes(locationId));
    },

    /** assignment history entries for one equipment item, chronological */
    assignmentHistory(equipment, { active = true, past = true } = {}) {
      const list = (equipment.locationAssignments ?? [])
        .slice()
        .sort((a, b) => a.from.localeCompare(b.from));
      return list.filter((a) => (a.to ? past : active));
    }
  };
})();