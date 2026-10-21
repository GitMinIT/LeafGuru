/**
 * LeafGuru — History page controller.
 * One scrollable event log per grow: stage changes, harvests,
 * measurements, moves, tasks, equipment — newest last, each row opens
 * the shared verbose event popup.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const hd = window.LeafGuru.historyDomain;
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    let growId = null;

    const rowTitle = (e) => window.LeafGuru.historyView.titleFor(e).replace(/^[^ ]+ /, "");

    async function loadGrowOptions(grows) {
      const sel = $("[data-history-grow]");
      const cur = sel.value;
      sel.replaceChildren(new Option(t("history.pickGrow"), ""));
      const order = { active: 0, planned: 1, harvested: 2, closed: 3 };
      for (const g of grows.slice().sort((a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name))) {
        sel.append(new Option(g.name, g.id));
      }
      sel.value = growId && grows.some((g) => g.id === growId) ? growId : cur;
      if (!sel.value) { // default: the flagged default grow, else first active
        sel.value = window.LeafGuru.growDomain.defaultGrowId(grows) ?? "";
      }
      growId = sel.value || null;
    }

    async function render() {
      const [grows, plants, stageLogs, measurements, locationChanges, tasks, equipment, photos, locations, strainTemplates, logEntries] =
        await Promise.all([
          storage.list("grows"), storage.list("plants"), storage.list("stageLogs"),
          storage.list("measurements"), storage.list("locationChanges"), storage.list("tasks"),
          storage.list("equipment"), storage.list("photos"), storage.list("locations"),
          storage.list("strainTemplates"), storage.list("logEntries")
        ]);
      await loadGrowOptions(grows);

      const grow = grows.find((g) => g.id === growId) ?? null;
      $("[data-history-empty-grow]").hidden = grows.length > 0;
      $("[data-history-list-section]").hidden = !grow;
      if (!grow) return;

      const events = hd.eventsForGrow(grow, {
        plants, stageLogs, measurements, locationChanges, tasks, equipment, photos,
        locations, strainTemplates, logEntries
      });
      // linked journal photos for the popup thumbnails (grow-scoped)
      window.LeafGuru.historyView._linkedPhotos =
        photos.filter((p) => p.logEntryId != null);

      const listEl = $("[data-history-list]");
      listEl.replaceChildren();
      $("[data-history-empty]").hidden = events.length > 0;

      let lastDate = null;
      for (const event of events) {
        if (event.at !== lastDate) {
          const head = document.createElement("li");
          head.className = "history-date";
          head.textContent = window.LeafGuru.format.date(event.at);
          listEl.append(head);
          lastDate = event.at;
        }
        const li = document.createElement("li");
        li.className = "history-row";
        const icon = document.createElement("span");
        icon.className = "history-icon";
        icon.textContent = window.LeafGuru.historyView.icons[event.kind] ?? "•";
        const title = document.createElement("span");
        title.className = "history-title";
        title.textContent = rowTitle(event);
        const kind = document.createElement("span");
        kind.className = "history-kind muted";
        kind.textContent = t("history.kinds." + event.kind);
        const plant = document.createElement("span");
        plant.className = "history-plant muted";
        plant.textContent = event.plant?.name ?? "";
        li.append(icon, title, kind, plant);
        li.addEventListener("click", () => window.LeafGuru.historyView.open(event, {
          dialog: $("[data-event-popup]")
        }));
        listEl.append(li);
      }
    }

    $("[data-history-grow]").addEventListener("change", (event) => {
      growId = event.target.value || null;
      render();
    });


    // "+ Log entry" on the journal page — pre-selects the shown grow
    $("[data-history-add-log]").addEventListener("click", () =>
      window.LeafGuru.quickLog.open({ presetGrowId: growId }));
    window.LeafGuru.quickLog.onSaved = () => render();
    window.LeafGuru.historyView.onLogDeleted = () => render();

    await render();

    // deep link: /history/?grow=<id> (e.g. journal chips from the Timeline)
    try {
      const linkedGrow = new URLSearchParams(window.location?.search ?? "").get("grow");
      if (linkedGrow) {
        growId = linkedGrow;
        await render();
        window.history?.replaceState?.(null, "", "/history/");
      }
    } catch { /* deep links are optional in tests */ }
  });
})();