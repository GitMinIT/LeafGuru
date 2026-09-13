/**
 * LeafGuru — schema loader.
 * Fetches schemas/*.schema.json once and exposes LeafGuru.schemas
 * (map: filename → schema) for the validator and forms.
 */
(function () {
  "use strict";

  const FILES = [
    "location.schema.json", "equipment.schema.json", "strain-template.schema.json",
    "plant.schema.json", "stage-log.schema.json", "measurement.schema.json",
    "location-change.schema.json", "task.schema.json", "photo.schema.json",
    "bundle.schema.json"
  ];

  window.LeafGuru = window.LeafGuru || {};
  window.LeafGuru.schemas = {};
  window.LeafGuru.loadSchemas = async function loadSchemas() {
    await Promise.all(FILES.map(async (file) => {
      const res = await fetch(`/static/js/schemas/${file}`);
      if (!res.ok) throw new Error(`schema load failed: ${file}`);
      window.LeafGuru.schemas[file] = await res.json();
    }));
    return window.LeafGuru.schemas;
  };
})();