/**
 * LeafGuru — Timeline page controller.
 * Month calendar with per-day events: stage changes, harvests, grow
 * start/end, open tasks. Month navigation via ‹ › buttons.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = await window.LeafGuru.createStorage();

    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const tl = window.LeafGuru.timelineDomain;
    const storage = window.LeafGuru.storage;
    const $ = (sel) => document.querySelector(sel);

    const MONTHS = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    const eventTarget = (e) => {
      switch (e.kind) {
        case "stage": case "harvest": case "germination": case "taskPlanned":
          return e.record?.plantId ? `/plants/?plant=${e.record.plantId}` : null;
        case "log":
          return e.record?.growId ? `/history/?grow=${e.record.growId}` : null;
        case "growStart": case "growEnd":
          return e.record?.id ? `/grows/?grow=${e.record.id}` : null;
      default:
        return null;
      }
    };
    const eventLabel = (e) => {
      switch (e.kind) {
        case "stage":
          return `${t("stages." + e.stage)}: ${e.plantName}`;
        case "harvest":
          return t("timeline.harvest", { name: e.plantName })
            + (e.yieldG != null ? ` (${Math.round(e.yieldG)} g)` : "");
        case "growStart":
          return t("timeline.growStart", { name: e.growName });
        case "growEnd":
          return t("timeline.growEnd", { name: e.growName });
        case "taskPlanned":
          return `${t("nav.tasks")}: ${e.title}` + (e.plantName ? ` (${e.plantName})` : "");
        case "log":
          return (e.categories ?? [])
            .map((c) => t("log.categories." + c)).join("/") + (e.plantName ? ` (${e.plantName})` : "");
        default:
          return "";
      }
    };

    async function render() {
      const [grows, plants, stageLogs, tasks, logEntries] = await Promise.all([
        storage.list("grows"), storage.list("plants"),
        storage.list("stageLogs"), storage.list("tasks"), storage.list("logEntries")
      ]);
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      $("[data-timeline-title]").textContent = `${MONTHS[month]} ${year}`;
      const grid = $("[data-timeline-grid]");
      grid.replaceChildren();

      // weekday header (Mon–Sun)
      for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
        const th = document.createElement("div");
        th.className = "tl-head";
        th.textContent = day;
        grid.append(th);
      }

      const { weeks } = tl.monthMatrix(year, month, todayIso);
      for (const week of weeks) {
        for (const cell of week) {
          const cellEl = document.createElement("div");
          cellEl.className = "tl-cell"
            + (cell.inMonth ? "" : " tl-cell--out")
            + (cell.isToday ? " tl-cell--today" : "");
          const num = document.createElement("span");
          num.className = "tl-day";
          num.textContent = String(Number(cell.date.slice(8)));
          cellEl.append(num);
          const events = tl.eventsForDate(cell.date, { grows, plants, stageLogs, tasks, logEntries });
          for (const e of events) {
            // link chip: jumps to the entity's page; popup opens from there
            const target = eventTarget(e);
            const item = document.createElement(target ? "a" : "button");
            if (target) {
              item.href = target;
              item.title = `${eventLabel(e)} — ${t("timeline.openEntry")}`;
            } else {
              item.type = "button";
              item.title = eventLabel(e);
            }
            item.className = `tl-event tl-event--${e.kind}`;
            item.textContent = eventLabel(e);
            if (!target) {
              // no entity page — open the detail popup in place
              item.addEventListener("click", () =>
                window.LeafGuru.historyView.open(e, { dialog: $("[data-event-popup]") }));
            }
            cellEl.append(item);
          }
          grid.append(cellEl);
        }
      }
    }

    $("[data-timeline-prev]").addEventListener("click", () => {
      month--;
      if (month < 0) { month = 11; year--; }
      render();
    });
    $("[data-timeline-next]").addEventListener("click", () => {
      month++;
      if (month > 11) { month = 0; year++; }
      render();
    });
    $("[data-timeline-today]").addEventListener("click", () => {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
      render();
    });

    await render();
  });
})();