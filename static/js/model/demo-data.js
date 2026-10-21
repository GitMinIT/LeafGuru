/**
 * LeafGuru — demo grow generator.
 *
 * Builds a complete, schema-valid dataset that shows every feature with
 * realistic content: two locations, equipment with costs, real catalog
 * strains, plants in every stage, stage logs, height measurements, a
 * location move, a task list and a journal.
 *
 * Dates are generated RELATIVE to now, so the demo always looks like a
 * grow in progress (day 12 vs. day 60) no matter when it is loaded.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const DAY = 86400000;

  /** ISO timestamp N days ago, at a fixed local hour/minute */
  function ago(days, hour = 9, minute = 0) {
    const d = new Date(Date.now() - days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  /** plain YYYY-MM-DD, N days ago (negative = in the future) */
  function dayOffset(days) {
    const d = new Date(Date.now() - days * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function uid() {
    return window.LeafGuru.uuid
      ? window.LeafGuru.uuid()
      : "00000000-0000-4000-8000-000000000000";
  }

  /** typical grow profile per genotype — matches tools/build-strain-catalog.js */
  const PROFILES = {
    indica: { seedling: 14, vegetative: 24, flowering: 56, height: 120 },
    sativa: { seedling: 14, vegetative: 35, flowering: 63, height: 220 },
    hybrid: { seedling: 14, vegetative: 30, flowering: 56, height: 160 },
    unknown: { seedling: 14, vegetative: 28, flowering: 56, height: 140 },
  };

  /**
   * Build the demo bundle.
   * @returns an object matching schemas/bundle.schema.json
   */
  function buildDemoGrow() {
    const now = new Date().toISOString();

    // --- locations ---------------------------------------------------
    const tent = {
      id: uid(), name: "Grow tent", type: "indoor",
      size: { widthCm: 120, depthCm: 60, heightCm: 200, areaM2: 0.72 },
      notes: "Main indoor setup, 600W LED above.",
      active: true, createdAt: ago(70, 8), updatedAt: ago(70, 8),
    };
    const balcony = {
      id: uid(), name: "Balcony", type: "outdoor",
      size: { widthCm: 240, depthCm: 100, heightCm: 0, areaM2: 2.4 },
      notes: "South-facing, good sun from noon.",
      active: true, createdAt: ago(70, 8), updatedAt: ago(70, 8),
    };

    // --- strain templates (real catalog strains) ---------------------
    const strains = [
      {
        name: "White Widow", breeder: "Green House Seed Co.", genotype: "hybrid",
        characteristics: "Focused · Earthy, Sweet · Limonene",
      },
      {
        name: "Amnesia", breeder: "Sensation Seeds", genotype: "sativa",
        characteristics: "Uplifted, Energetic, Creative · Citrus, Tropical",
      },
      {
        name: "Purple Kush", breeder: "Resin Kings", genotype: "indica",
        characteristics: "Relaxed, Sleepy · Earthy, Grape",
      },
    ].map((s) => {
      const p = PROFILES[s.genotype];
      return {
        id: uid(), name: s.name, breeder: s.breeder, genotype: s.genotype,
        stageDurations: {
          seedling: p.seedling, vegetative: p.vegetative, flowering: p.flowering,
        },
        expectedHeightCm: p.height, characteristics: s.characteristics,
        notes: "From the built-in strain catalog.",
        createdAt: ago(70, 8), updatedAt: ago(70, 8),
      };
    });
    const [ww, amnesia, purpleKush] = strains;

    // --- grow --------------------------------------------------------
    const grow = {
      id: uid(), name: "Demo Grow 2026", status: "active", isDefault: true,
      locationIds: [tent.id, balcony.id],
      startDate: dayOffset(62), endDate: null,
      notes: "A complete example grow — explore every page with it.",
      createdAt: ago(70, 8), updatedAt: ago(1, 20),
    };
    const archived = {
      id: uid(), name: "Demo Grow 2025 (archived)", status: "closed", isDefault: false,
      locationIds: [tent.id],
      startDate: dayOffset(430), endDate: dayOffset(300),
      notes: "Last season — shows harvest and cost statistics.",
      createdAt: ago(440, 8), updatedAt: ago(300, 18),
    };

    // --- equipment ---------------------------------------------------
    const equip = (name, category, specs, cost, extra = {}) => ({
      id: uid(), growId: grow.id, name, category, specs,
      purchaseDate: dayOffset(120), cost, currency: "EUR", status: "in-use",
      notes: "", availableEverywhere: false,
      locationAssignments: [], createdAt: ago(120, 12), updatedAt: ago(120, 12),
      ...extra,
    });
    const equipment = [
      equip("LED grow light 600W", "light", "600W, full spectrum", 189.0, {
        icon: "💡", locationAssignments: [{ locationId: tent.id, from: ago(70, 8), to: null }],
      }),
      equip("Ventilation fan 150mm", "fan", "150mm, 3 speeds", 24.5, {
        icon: "🌀", availableEverywhere: true,
      }),
      equip("Carbon filter", "filter", "100mm inline", 32.9, {
        icon: "🌀", locationAssignments: [{ locationId: tent.id, from: ago(70, 8), to: null }],
      }),
      equip("pH meter", "sensor", "Bluetooth, ±0.1", 21.4, {
        icon: "🌡️", availableEverywhere: true,
      }),
      equip("Watering can 10L", "other", "10L, brass rose", 18.0, {
        icon: "🪴", availableEverywhere: true,
      }),
      equip("Organic soil 50L", "soil", "50L, coco-perlite mix", 27.9, {
        icon: "🌱", locationAssignments: [{ locationId: tent.id, from: ago(70, 8), to: null }],
      }),
      equip("Nutrient set A/B", "nutrient", "3-part, 1L each", 39.9, {
        icon: "🧪", locationAssignments: [{ locationId: tent.id, from: ago(70, 8), to: null }],
      }),
      equip("Pot 7L", "pot", "7L fabric pot", 4.5, {
        icon: "🪴", locationAssignments: [{ locationId: balcony.id, from: ago(70, 8), to: null }],
      }),
    ];

    // --- plants ------------------------------------------------------
    const stageLogs = [];
    const measurements = [];

    /**
     * Add a plant with a stage history.
     * `stages` = [{ stage, daysAgo }] in chronological order; the LAST
     * entry is the current (still open) stage.
     */
    function addPlant({
      name, growId, strain, stage, stages, sex = "unknown", locationId,
      status = "growing", germinationDaysAgo, notes = null,
      yields = null, harvestedDaysAgo = null, measured = [],
    }) {
      const plantId = uid();
      stages.forEach((s, i) => {
        const next = stages[i + 1];
        stageLogs.push({
          id: uid(), plantId, stage: s.stage,
          enteredAt: ago(s.daysAgo, 10),
          leftAt: next ? ago(next.daysAgo, 10) : null,
          createdAt: ago(s.daysAgo, 10), updatedAt: ago(s.daysAgo, 10),
        });
      });
      for (const m of measured) {
        measurements.push({
          id: uid(), plantId, type: "height", value: m.cm, unit: "cm",
          measuredAt: ago(m.daysAgo, 18), note: "",
          createdAt: ago(m.daysAgo, 18), updatedAt: ago(m.daysAgo, 18),
        });
      }
      return {
        id: plantId, growId, name,
        strainTemplateId: strain ? strain.id : null,
        customStrain: null, sex,
        germinationDate: dayOffset(germinationDaysAgo),
        stage, locationId, status,
        harvestYieldG: yields ? yields.total : null,
        budG: yields ? yields.bud : null,
        leafG: yields ? yields.leaf : null,
        sugarLeafG: yields ? yields.sugarLeaf : null,
        stemG: yields ? yields.stem : null,
        smellTerpenes: yields ? yields.smell : null,
        harvestedAt: harvestedDaysAgo != null ? dayOffset(harvestedDaysAgo) : null,
        notes, createdAt: ago(germinationDaysAgo, 10), updatedAt: ago(1, 20),
      };
    }

    const plants = [];
    plants.push(addPlant({
      name: "WW #1", growId: grow.id, strain: ww, stage: "flowering", status: "growing",
      sex: "female", locationId: tent.id, germinationDaysAgo: 58,
      stages: [{ stage: "germinating", daysAgo: 58 }, { stage: "seedling", daysAgo: 52 },
        { stage: "vegetative", daysAgo: 38 }, { stage: "flowering", daysAgo: 12 }],
      measured: [{ daysAgo: 40, cm: 18 }, { daysAgo: 30, cm: 34 }, { daysAgo: 20, cm: 58 },
        { daysAgo: 12, cm: 86 }, { daysAgo: 4, cm: 112 }],
      notes: "Strongest of the White Widow batch.",
    }));
    plants.push(addPlant({
      name: "WW #2", growId: grow.id, strain: ww, stage: "vegetative", status: "growing",
      sex: "female", locationId: tent.id, germinationDaysAgo: 58,
      stages: [{ stage: "germinating", daysAgo: 58 }, { stage: "seedling", daysAgo: 52 },
        { stage: "vegetative", daysAgo: 40 }],
      measured: [{ daysAgo: 40, cm: 16 }, { daysAgo: 30, cm: 27 }, { daysAgo: 10, cm: 41 }],
    }));
    plants.push(addPlant({
      name: "Amnesia A", growId: grow.id, strain: amnesia, stage: "seedling", status: "growing",
      sex: "unknown", locationId: tent.id, germinationDaysAgo: 12,
      stages: [{ stage: "germinating", daysAgo: 12 }, { stage: "seedling", daysAgo: 6 }],
      measured: [{ daysAgo: 6, cm: 5 }, { daysAgo: 2, cm: 9 }],
    }));
    plants.push(addPlant({
      name: "PK Outdoor", growId: grow.id, strain: purpleKush, stage: "vegetative", status: "growing",
      sex: "unknown", locationId: balcony.id, germinationDaysAgo: 30,
      stages: [{ stage: "germinating", daysAgo: 30 }, { stage: "seedling", daysAgo: 24 },
        { stage: "vegetative", daysAgo: 12 }],
      measured: [{ daysAgo: 20, cm: 14 }, { daysAgo: 10, cm: 26 }, { daysAgo: 3, cm: 33 }],
      notes: "Moved outside for the summer.",
    }));
    plants.push(addPlant({
      name: "Amnesia B", growId: grow.id, strain: amnesia, stage: "germinating", status: "growing",
      sex: "unknown", locationId: tent.id, germinationDaysAgo: 3,
      stages: [{ stage: "germinating", daysAgo: 3 }],
      measured: [],
      notes: "Just popped — first seedling not out yet.",
    }));
    // a finished plant from the archived grow
    plants.push(addPlant({
      name: "WW Harvest 2025", growId: archived.id, strain: ww, stage: "cured", status: "cured",
      sex: "female", locationId: tent.id, germinationDaysAgo: 380,
      stages: [{ stage: "germinating", daysAgo: 380 }, { stage: "seedling", daysAgo: 374 },
        { stage: "vegetative", daysAgo: 360 }, { stage: "flowering", daysAgo: 330 },
        { stage: "harvest", daysAgo: 320 }, { stage: "drying", daysAgo: 312 },
        { stage: "cured", daysAgo: 300 }],
      harvestedDaysAgo: 320,
      yields: {
        total: 96.4, bud: 78.0, leaf: 9.2, sugarLeaf: 6.1, stem: 3.1,
        smell: "sweet, earthy, hint of citrus",
      },
      measured: [{ daysAgo: 340, cm: 70 }, { daysAgo: 330, cm: 118 }, { daysAgo: 320, cm: 145 }],
    }));

    const locationChanges = [{
      id: uid(), plantId: plants[3].id,
      fromLocationId: tent.id, toLocationId: balcony.id,
      changedAt: ago(20, 14), reason: "Moved outside for the summer.",
      createdAt: ago(20, 14), updatedAt: ago(20, 14),
    }];

    // --- tasks -------------------------------------------------------
    const task = (title, description, plantId, locationId, dueOffsetDays, priority, status, stageHint = null) => ({
      id: uid(), growId: grow.id, title, description, plantId, locationId, stageHint,
      dueDate: dayOffset(-dueOffsetDays), priority, status,
      completedAt: status === "done" ? ago(2, 17) : null,
      createdAt: ago(30, 8), updatedAt: ago(2, 17),
    });
    const tasks = [
      task("Water the tent", "5L, pH 6.2", plants[0].id, tent.id, 0, "high", "open", "flowering"),
      task("Top FIM the veg room", "5 nodes on WW #2 and Amnesia A", plants[1].id, tent.id, 1, "medium", "open", "vegetative"),
      task("Check pH of the reservoir", "Adjust to 6.0–6.3", null, tent.id, 0, "medium", "open", null),
      task("Flush before harvest", "Start a 7-day flush", plants[0].id, tent.id, 9, "high", "open", "flowering"),
      task("Clean the carbon filter", "Replace prefilters", null, tent.id, -2, "low", "open", null),
      task("Water the balcony pots", "Check soil first", plants[3].id, balcony.id, 1, "medium", "open", "vegetative"),
      task("Mix 10L of nutrients", "A/B at 1.2 ml/L", null, tent.id, 0, "medium", "done", null),
      task("Photograph the tent", "Weekly progress shot", null, tent.id, -4, "low", "done", null),
    ];

    // --- journal -----------------------------------------------------
    const log = (daysAgo, categories, text, extra = {}) => ({
      id: uid(), growId: grow.id, at: ago(daysAgo, 19, 30), categories, text,
      amountL: null, ph: null, ec: null, tempC: null, humidityPct: null,
      product: null, dose: null, technique: null, stressLevel: null,
      defoliationStyle: null, defoliationPercent: null, fermentationNote: null,
      plantIds: [], locationId: tent.id,
      createdAt: ago(daysAgo, 19, 30), updatedAt: ago(daysAgo, 19, 30),
      ...extra,
    });
    const logEntries = [
      log(1, ["watering", "feeding"], "Watered 5L, fed A/B at 1.2 ml/L", {
        amountL: 5, ph: 6.2, ec: 1.4, tempC: 22.5, humidityPct: 58,
        product: "Grow nutrients A/B", dose: "1.2 ml/L",
        plantIds: [plants[0].id, plants[1].id],
      }),
      log(2, ["observation"], "White Widow #1 showing lots of white pistils, first signs of trichome haze", {
        plantIds: [plants[0].id],
      }),
      log(4, ["training"], "Applied LST to the lower branches, tied down the fan leaves", {
        technique: "LST", stressLevel: "low", plantIds: [plants[0].id, plants[1].id],
      }),
      log(6, ["defoliation"], "Selective defoliation on the lower third to open up airflow", {
        defoliationStyle: "selective", defoliationPercent: 20, plantIds: [plants[1].id],
      }),
      log(9, ["feeding"], "Top-up with bloom nutrients, EC up to 1.6", {
        amountL: 2, ec: 1.6, ph: 6.1, product: "Bloom nutrients", dose: "1.5 ml/L",
        plantIds: [plants[0].id],
      }),
      log(12, ["treatment"], "Checked for pests under the leaves, no sign of spider mites", {
        plantIds: [plants[0].id, plants[1].id, plants[2].id],
      }),
      log(16, ["watering"], "Watered 4L, plain water only this round", {
        amountL: 4, ph: 6.4, tempC: 23.5, humidityPct: 55, plantIds: [plants[0].id, plants[2].id],
      }),
      log(20, ["note"], "Moved PK Outdoor to the balcony for the summer", {
        plantIds: [plants[3].id], locationId: balcony.id,
      }),
    ];

    return {
      meta: {
        app: "LeafGuru",
        schemaVersion: 1,
        exportedAt: now,
        appVersion: window.LeafGuru.VERSION ?? "0.1.0",
        note: "Demo grow — a complete example dataset for exploring LeafGuru.",
      },
      grows: [grow, archived],
      locations: [tent, balcony],
      equipment,
      strainTemplates: strains,
      plants,
      stageLogs,
      measurements,
      locationChanges,
      tasks,
      logEntries,
      photos: [],
      entityEdits: [],
    };
  }

  /**
   * Build the demo grow and import it (replacing current data).
   * @param {StorageAdapter} storage
   */
  async function seedDemoGrow(storage) {
    const bundle = buildDemoGrow();
    await storage.importBundle(bundle);
    return bundle;
  }

  /**
   * Load the demo into its OWN profile ("Demo"), never into the user's
   * active data. The demo is meant for exploring — it must not be able to
   * wipe a real grow. After loading, the app switches to the demo profile
   * so the user lands in it.
   *
   * Returns { profile, bundle, switched }.
   */
  async function seedDemoProfile({ switchTo = true } = {}) {
    const bundle = buildDemoGrow();

    // --- server mode: the demo is its own workspace -------------------
    if (window.LeafGuru.isServerMode?.()) {
      const workspaces = window.LeafGuru.workspaces;
      // ensure(), not create(): loading the demo twice must reuse the
      // same workspace instead of creating a new "Demo" every click.
      const profile = await workspaces.ensure("Demo");
      const switched = workspaces.activeId() !== profile.id;
      workspaces.setActive(profile.id);
      const storage = new window.LeafGuru.ServerAdapter();
      await storage.importBundle(bundle);
      return { profile, bundle, switched };
    }

    // --- local mode: the demo is its own IndexedDB profile ------------
    const profiles = window.LeafGuru.profiles;
    if (!profiles) throw new Error("profiles are not available");
    const profile = profiles.ensure("Demo", { id: profiles.DEMO_ID });
    // an adapter bound to the demo profile -> its own database
    const storage = new window.LeafGuru.LocalAdapter({ profileId: profile.id });
    await storage.importBundle(bundle);
    let switched = false;
    if (switchTo && profiles.activeId() !== profile.id) {
      profiles.setActive(profile.id);
      switched = true;
    }
    return { profile, bundle, switched };
  }

  window.LeafGuru.demoData = {
    buildDemoGrow, seedDemoGrow, seedDemoProfile, PROFILES
  };
})();
