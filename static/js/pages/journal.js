/**
 * LeafGuru — Journal page.
 *
 * The daily story of a grow, read back as a story: entries grouped by
 * day, newest first, with the categories as a quiet badge row.
 *
 * This is the page you open when you want to REMEMBER what you did,
 * not when you want to record it — recording is one tap on the Today
 * page. So the emphasis here is readability: day headers, a readable
 * entry line, and a filter that gets out of the way.
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
    const logDomain = window.LeafGuru.logDomain;

    let state = { entries: [], grows: [], plants: [] };
    let growId = null;
    let categoryFilter = "";
    let searchTerm = "";

    async function load() {
      const [entries, grows, plants] = await Promise.all([
        storage.list("logEntries"), storage.list("grows"), storage.list("plants")
      ]);
      state = { entries, grows, plants };
    }

    function loadGrowOptions() {
      const sel = $("[data-journal-grow]");
      const order = { active: 0, planned: 1, harvested: 2, closed: 3 };
      sel.replaceChildren(new Option(t("journal.filterAll"), ""));
      for (const g of state.grows.slice().sort((a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name))) {
        sel.append(new Option(g.name, g.id));
      }
      sel.value = growId ?? window.LeafGuru.growDomain.defaultGrowId(state.grows) ?? "";
      growId = sel.value || null;
    }

    /** the day an entry belongs to, in the user's timezone */
    function dayKey(iso) {
      const parts = fmt.partsIn(iso, window.LeafGuru.settings?.get?.("timezone"));
      return parts ? `${parts.year}-${parts.month}-${parts.day}` : String(iso).slice(0, 10);
    }

    /** a friendly label for a day: Today / Yesterday / the date */
    function dayLabel(key) {
      const today = window.LeafGuru.taskDomain.today();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (key === today) return t("journal.today");
      if (key === yesterday) return t("journal.yesterday");
      return fmt.date(key);
    }

    /** the entries to show, filtered and sorted newest first */
    function visibleEntries() {
      let entries = state.entries.slice();
      if (growId) entries = entries.filter((e) => e.growId === growId);
      if (categoryFilter) {
        entries = entries.filter((e) => logDomain.categoriesOf(e).includes(categoryFilter));
      }
      if (searchTerm) {
        const needle = searchTerm.toLowerCase();
        entries = entries.filter((e) =>
          (e.text ?? "").toLowerCase().includes(needle)
          || logDomain.categoriesOf(e).some((c) => c.toLowerCase().includes(needle)));
      }
      return entries.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    }

    function render() {
      const ul = $("[data-journal-list]");
      ul.replaceChildren();
      const entries = visibleEntries();

      const empty = $("[data-journal-empty]");
      empty.hidden = entries.length > 0;
      ul.hidden = entries.length === 0;

      // the count in the header
      $("[data-journal-count]").textContent = entries.length === 1
        ? t("journal.oneEntry")
        : t("journal.entries", { count: entries.length });

      let currentDay = null;
      for (const entry of entries) {
        const key = dayKey(entry.at);
        if (key !== currentDay) {
          currentDay = key;
          const header = document.createElement("li");
          header.className = "journal-day";
          const name = document.createElement("span");
          name.className = "journal-day__name";
          name.textContent = dayLabel(key);
          const date = document.createElement("span");
          date.className = "journal-day__date muted";
          date.textContent = key !== dayLabel(key) ? fmt.date(key) : "";
          header.append(name, date);
          ul.append(header);
        }

        const li = document.createElement("li");
        li.className = "journal-entry";

        // the categories, as quiet badges
        const cats = document.createElement("span");
        cats.className = "journal-entry__cats";
        for (const cat of logDomain.categoriesOf(entry)) {
          const badge = document.createElement("span");
          badge.className = "journal-badge";
          badge.textContent = t("log.categories." + cat);
          cats.append(badge);
        }

        // the text and its numbers
        const text = document.createElement("span");
        text.className = "journal-entry__text";
        text.textContent = entry.text;

        // the plants it applies to
        const plantNames = (entry.plantIds ?? [])
          .map((id) => state.plants.find((p) => p.id === id)?.name)
          .filter(Boolean);
        const plants = document.createElement("span");
        plants.className = "muted";
        plants.textContent = plantNames.join(", ");

        // the time
        const time = document.createElement("span");
        time.className = "muted";
        time.textContent = fmt.dateTime(entry.at).split(", ").pop() ?? "";

        // delete
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn--danger";
        del.textContent = t("common.delete");
        del.addEventListener("click", async () => {
          await storage.delete("logEntries", entry.id);
          await load();
          render();
        });

        li.append(cats, text, plants, time, del);
        ul.append(li);
      }
    }

    function fillCategoryFilter() {
      const sel = $("[data-journal-category]");
      sel.replaceChildren(new Option(t("journal.filterAll"), ""));
      for (const cat of logDomain.categories) {
        sel.append(new Option(t("log.categories." + cat), cat));
      }
    }

    // --- the "+ log" button on this page --------------------------------
    $("[data-journal-add]").addEventListener("click", () => {
      window.LeafGuru.quickLog.open({ presetGrowId: growId });
    });
    // when the quick-log dialog saves, the list is stale
    window.LeafGuru.quickLog.onSaved = async () => {
      await load();
      render();
    };

    $("[data-journal-grow]").addEventListener("change", (e) => {
      growId = e.target.value || null;
      render();
    });
    $("[data-journal-category]").addEventListener("change", (e) => {
      categoryFilter = e.target.value;
      render();
    });
    $("[data-journal-search]").addEventListener("input", (e) => {
      searchTerm = e.target.value.trim();
      render();
    });

    fillCategoryFilter();
    await load();
    loadGrowOptions();
    render();
  });
})();
