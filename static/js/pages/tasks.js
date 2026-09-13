/**
 * LeafGuru — tasks page controller (scaffold).
 * CRUD wiring follows the locations.js pattern once the entity form is
 * finalized; storage + validation are already wired via CrudPage.
 */
(function () {
  "use strict";
  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    // full CRUD lands with the entity forms (phase 1 continues)
  });
})();
