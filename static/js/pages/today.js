/**
 * LeafGuru — Today page.
 *
 * The one page a grower opens every day. It answers three questions
 * without any hunting:
 *
 *   1. "What could my plants use right now?"  -> the care hints
 *   2. "What did I just do?"                   -> one-tap presets
 *   3. "What is growing?"                      -> the plants, at a glance
 *
 * The tone is the point: it greets you, it does not nag, and when
 * everything is fine it says so and stops.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = await window.LeafGuru.createStorage();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);
    const storage = window.LeafGuru.storage;
    const fmt = window.LeafGuru.format;

    // --- load everything the page needs --------------------------------
    const state = {
      grows: [], plants: [], tasks: [], logEntries: [],
      sensorReadings: [], strainTemplates: [], stageLogs: []
    };
    await Promise.all([
      storage.list("grows"), storage.list("plants"), storage.list("tasks"),
      storage.list("logEntries"), storage.list("sensorReadings"),
      storage.list("strainTemplates"), storage.list("stageLogs")
    ]).then(([grows, plants, tasks, logEntries, sensorReadings, strainTemplates, stageLogs]) => {
      state.grows = grows; state.plants = plants; state.tasks = tasks;
      state.logEntries = logEntries; state.sensorReadings = sensorReadings;
      state.strainTemplates = strainTemplates; state.stageLogs = stageLogs;
    });

    const growingPlants = () => state.plants.filter((p) => p.status === "growing");
    const activeGrows = () =>
      state.grows.filter((g) => g.status === "active" || g.status === "planned");

    /** the grow the presets log into: the default, else the first active */
    function activeGrowId() {
      return window.LeafGuru.growDomain.defaultGrowId(state.grows)
        ?? activeGrows()[0]?.id
        ?? null;
    }

    // --- the greeting ---------------------------------------------------
    function renderGreeting() {
      const hour = new Date().getHours();
      const key = hour < 5 ? "today.greetingEvening"
        : hour < 12 ? "today.greetingMorning"
        : hour < 18 ? "today.greetingAfternoon"
        : "today.greetingEvening";
      $("[data-today-greeting]").textContent = t(key);
      const grow = state.grows.find((g) => g.id === activeGrowId());
      $("[data-today-subline]").textContent = grow
        ? t("today.subline")
        : t("welcome.intro");
    }

    // --- the quick presets ---------------------------------------------
    function renderPresets() {
      const row = $("[data-today-presets]");
      row.replaceChildren();
      const growId = activeGrowId();
      for (const preset of window.LeafGuru.presets.PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-btn";
        btn.dataset.preset = preset.id;
        if (!growId) btn.disabled = true;
        const icon = document.createElement("span");
        icon.className = "preset-btn__icon";
        icon.textContent = preset.icon;
        icon.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "preset-btn__label";
        label.textContent = t("today.action" + preset.id.charAt(0).toUpperCase() + preset.id.slice(1));
        btn.append(icon, label);
        btn.addEventListener("click", () => logPreset(preset.id, btn));
        row.append(btn);
      }
      // no grow at all -> a gentle nudge instead of a row of dead buttons
      $("[data-today-nogrow]").hidden = !!growId;
    }

    /** log a preset entry, then offer to undo it */
    async function logPreset(presetId, button) {
      const growId = activeGrowId();
      if (!growId) {
        showFlash(t("log.pickGrow"), true);
        return;
      }
      const grow = state.grows.find((g) => g.id === growId);
      try {
        const entry = window.LeafGuru.presets.buildPresetEntry({ presetId, growId });
        const saved = await storage.put("logEntries", entry);
        state.logEntries.push(saved);
        if (button) {
          button.classList.add("preset-btn--done");
          setTimeout(() => button.classList.remove("preset-btn--done"), 900);
        }
        // the details route opens the full dialog, pre-filled
        showFlash(t("journal.saved"), false, {
          label: t("journal.addDetails"),
          action: () => window.LeafGuru.quickLog.open({ presetGrowId: growId })
        });
        // a watering changes what the hints say, so refresh them
        renderHints();
        renderPlants();
      } catch (e) {
        showFlash(e.name === "LeafGuruValidationError"
          ? window.LeafGuru.ui.formatErrors(e) : e.message, true);
      }
    }

    /**
     * The little message under the presets. It carries an optional
     * action button ("add details") — and an undo, so a mis-tap costs
     * nothing.
     */
    function showFlash(message, isError, action = null) {
      const el = $("[data-today-flash]");
      el.replaceChildren();
      const text = document.createElement("span");
      text.textContent = message;
      el.append(text);
      if (action) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn--ghost";
        btn.textContent = action.label;
        btn.addEventListener("click", action.action);
        el.append(btn);
      }
      el.hidden = false;
      el.classList.toggle("today-flash--error", !!isError);
    }

    // --- the care hints -------------------------------------------------
    function renderHints() {
      const ul = $("[data-today-hints]");
      ul.replaceChildren();
      const hints = window.LeafGuru.hintsDomain.compute(state);
      const empty = $("[data-today-hints-empty]");
      empty.hidden = hints.length > 0;
      ul.hidden = hints.length === 0;

      for (const hint of hints) {
        const li = document.createElement("li");
        li.className = `hint hint--${hint.severity}`;

        const body = document.createElement("div");
        body.className = "hint__body";

        const title = document.createElement("p");
        title.className = "hint__title";
        title.textContent = hint.title;

        const detail = document.createElement("p");
        detail.className = "hint__detail";
        detail.textContent = hint.detail;

        body.append(title, detail);

        if (hint.action?.href) {
          const link = document.createElement("a");
          link.className = "hint__action";
          link.href = hint.action.href;
          link.textContent = hint.action.label;
          body.append(link);
        }

        const badge = document.createElement("span");
        badge.className = "hint__kind";
        badge.textContent = t("hints.kinds." + hint.kind);
        badge.setAttribute("aria-hidden", "true");

        li.append(badge, body);
        ul.append(li);
      }
    }

    // --- due today -------------------------------------------------------
    function renderDue() {
      const ul = $("[data-today-tasks]");
      ul.replaceChildren();
      const today = window.LeafGuru.taskDomain.today();
      const due = window.LeafGuru.taskDomain.dueList(state.tasks, { today })
        .filter((task) => task.dueDate === today || window.LeafGuru.taskDomain.isOverdue(task, today));
      const empty = $("[data-today-tasks-empty]");
      empty.hidden = due.length > 0;
      ul.hidden = due.length === 0;
      for (const task of due) {
        const li = document.createElement("li");
        li.className = "today-task";
        const overdue = window.LeafGuru.taskDomain.isOverdue(task, today);
        if (overdue) li.classList.add("today-task--overdue");
        const title = document.createElement("span");
        title.className = "today-task__title";
        title.textContent = task.title;
        const dueAt = document.createElement("span");
        dueAt.className = "muted";
        dueAt.textContent = overdue
          ? t("dashboard.overdue")
          : t("common.today");
        li.append(title, dueAt);
        ul.append(li);
      }
    }

    // --- the plants ------------------------------------------------------
    function renderPlants() {
      const ul = $("[data-today-plants]");
      ul.replaceChildren();
      const plants = growingPlants();
      const empty = $("[data-today-plants-empty]");
      empty.hidden = plants.length > 0;
      ul.hidden = plants.length === 0;

      const templatesById = new Map(state.strainTemplates.map((s) => [s.id, s]));
      for (const plant of plants) {
        const li = document.createElement("li");
        li.className = "today-plant";

        const name = document.createElement("span");
        name.className = "today-plant__name";
        name.textContent = plant.name;

        const stage = document.createElement("span");
        stage.className = "today-plant__stage";
        stage.textContent = t("stages." + plant.stage);

        // how long it has been in this stage
        const progress = window.LeafGuru.plantDomain.stageProgress({
          plant, stageLogs: state.stageLogs,
          strainTemplate: templatesById.get(plant.strainTemplateId) ?? null
        });
        const day = document.createElement("span");
        day.className = "muted";
        if (progress) {
          day.textContent = t("today.daysInStage", {
            day: progress.day, stage: t("stages." + plant.stage).toLowerCase()
          });
        } else {
          const open = window.LeafGuru.plantDomain.openStage(state.stageLogs, plant.id);
          const days = open
            ? window.LeafGuru.plantDomain.daysSince(open.enteredAt)
            : null;
          day.textContent = days == null ? "" : t("today.daysInStage", {
            day: days, stage: t("stages." + plant.stage).toLowerCase()
          });
        }

        // when it was last watered
        const lastWater = window.LeafGuru.hintsDomain.lastEntry(
          state.logEntries, "watering", plant.growId);
        const watered = document.createElement("span");
        watered.className = "muted";
        watered.textContent = lastWater
          ? t("today.lastWatered", { when: fmt.date(lastWater.at) })
          : t("today.neverWatered");

        li.append(name, stage, day, watered);
        ul.append(li);
      }
    }

    // --- go ---------------------------------------------------------------
    renderGreeting();
    renderPresets();
    renderHints();
    renderDue();
    renderPlants();
  });
})();
