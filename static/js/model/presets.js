/**
 * LeafGuru — journal presets.
 *
 * The most common things a grower writes down, in one tap: watered,
 * fed, trained, looked in. A beginner should never face an empty form
 * to say "I watered the plants".
 *
 * A preset is a category plus a short default text. Tapping one
 * writes the entry straight away — and the UI then offers "add details"
 * (which opens the full dialog, pre-filled) and "undo" (because a
 * mis-tap should cost nothing).
 *
 * Pure data + a small builder; no DOM. Tested in
 * tests/presets.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /**
   * The presets, in the order they are shown. `icon` is a small
   * glyph — drawn as text, so it works without an icon font and
   * without an extra request.
   */
  const PRESETS = [
    { id: "watering", category: "watering", icon: "💧", text: "Watered" },
    { id: "feeding", category: "feeding", icon: "🌱", text: "Fed" },
    { id: "training", category: "training", icon: "✂️", text: "Trained" },
    { id: "observation", category: "observation", icon: "👀", text: "Looked in" },
    { id: "defoliation", category: "defoliation", icon: "🍃", text: "Defoliated" },
    { id: "treatment", category: "treatment", icon: "🧪", text: "Treated" }
  ];

  /** find a preset by its id */
  function byId(id) {
    return PRESETS.find((p) => p.id === id) ?? null;
  }

  /**
   * Build the journal entry for a preset.
   *
   * Delegates to logDomain.buildEntry, so the record is schema-valid by
   * construction and the category rules stay in one place.
   */
  function buildPresetEntry({ presetId, growId, at = null, text = null, plantIds = [] }) {
    const preset = byId(presetId);
    if (!preset) throw new Error(`unknown preset: ${presetId}`);
    if (!growId) throw new Error("a preset entry needs a growId");
    return window.LeafGuru.logDomain.buildEntry({
      growId,
      at: at ?? new Date().toISOString(),
      categories: [preset.category],
      text: text ?? preset.text,
      plantIds
    });
  }

  window.LeafGuru.presets = {
    PRESETS,
    byId,
    buildPresetEntry
  };
})();
