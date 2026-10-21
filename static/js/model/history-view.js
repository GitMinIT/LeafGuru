/**
 * LeafGuru — event popup view: verbose rendering of one history/timeline
 * event inside a <dialog> ([data-event-popup]). Shared by the Timeline
 * and History pages; wires its own close button on first use.
 * Tested in tests/history-view.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const ICONS = {
    growStart: "🌱", growEnd: "🏁", germination: "🫘", stage: "🌿", harvest: "✂️",
    measurement: "📏", locationChange: "🚚", photo: "📷", taskPlanned: "🗓",
    taskDone: "✔", taskSkipped: "⏭", equipmentPurchase: "🧾", equipmentAssignment: "📦",
    log: "📝"
  };

  function fmt(value) {
    if (value === null || value === undefined) return "–";
    return String(value);
  }

  /** compact value for change-log lines */
  function shortValue(value) {
    if (value === null || value === undefined) return "–";
    if (typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === "object") return "{…}";
    return String(value);
  }

  /** which store an event's record lives in (for the change log) */
  function entityOfEvent(event) {
    switch (event.kind) {
      case "stage": return "stageLogs";
      case "taskPlanned": case "taskDone": case "taskSkipped": return "tasks";
      case "log": return "logEntries";
      case "measurement": return "measurements";
      case "locationChange": return "locationChanges";
      case "harvest": case "germination": return "plants";
      case "growStart": case "growEnd": return "grows";
      case "equipmentPurchase": case "equipmentAssignment": return "equipment";
      default: return null;
    }
  }

  /**
   * Verbose line for the popup body: label (i18n) + raw value, including
   * nested objects/arrays of the underlying record.
   */
  function detailLines(event) {
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const lines = [];
    const stageFields = (ev) => {
      const logs = [ev.record];
      return [
        ["history.entered", window.LeafGuru.format.date(ev.record.enteredAt)],
        ["history.left", ev.record.leftAt ? window.LeafGuru.format.date(ev.record.leftAt) : t("common.active")],
        ["history.durationDays", window.LeafGuru.plantDomain?.daysSince?.(
          ev.record.enteredAt, ev.record.leftAt ?? new Date().toISOString())]
      ];
    };
    switch (event.kind) {
      case "stage":
        return stageFields(event);
      case "locationChange":
        return [
          ["history.from", window.LeafGuru.historyView?.locationName?.(event.record.fromLocationId) ?? "–"],
          ["history.to", window.LeafGuru.historyView?.locationName?.(event.record.toLocationId) ?? "–"],
          ["plant.reason", event.record.reason || "–"]
        ];
      case "equipmentAssignment":
        return [
          ["history.assignedTo", event.location?.name ?? "–"],
          ["history.from", window.LeafGuru.format.date(event.record.fromDate ?? null)],
          ["history.durationDays", event.atEnd ? `${window.LeafGuru.format.date(event.at)} → ${window.LeafGuru.format.date(event.atEnd)}` : t("common.active")]
        ];
      case "photo":
        return [
          ["history.takenAt", window.LeafGuru.format.date(event.record.takenAt)],
          ["plant.photoPhase", event.record.phaseTag ?? "–"]
        ];
      case "taskPlanned":
      case "taskDone":
      case "taskSkipped":
        return [
          ["task.dueDate", event.record.dueDate ?? "–"],
          ["task.priority", t(`task.priority.${event.record.priority}`)],
          ["task.completed", event.record.completedAt ? window.LeafGuru.format.date(event.record.completedAt) : "–"],
          ["common.notes", event.record.description ?? "–"]
        ];
      case "measurement":
        return [
          ["history.value", `${event.record.value} ${event.record.unit}`],
          ["history.takenAt", window.LeafGuru.format.dateTime(event.record.measuredAt)],
          ["common.notes", event.record.note ?? "–"]
        ];
      case "harvest":
        return [
          ["plant.harvestYield", event.record.harvestYieldG != null ? `${Math.round(event.record.harvestYieldG)} g` : "–"],
          ["history.takenAt", event.record.harvestedAt ?? "–"]
        ];
      case "germination":
        return [["plant.germinationDate", event.record.germinationDate ?? "–"]];
      case "log":
        return [
          ["log.category", window.LeafGuru.logDomain.categoriesOf(event.record)
            .map((c) => t(`log.categories.${c}`)).join(", ")],
          ["log.amountL", event.record.amountL != null ? `${event.record.amountL} L` : "–"],
          ["log.ph", event.record.ph ?? "–"],
          ["log.ec", event.record.ec ?? "–"],
          ["log.tempC", event.record.tempC != null ? `${event.record.tempC} °C` : "–"],
          ["log.humidityPct", event.record.humidityPct != null ? `${event.record.humidityPct} %` : "–"],
          ["log.product", event.record.product ?? "–"],
          ["log.dose", event.record.dose ?? "–"],
          ["log.technique", event.record.technique ?? "–"],
          ["log.stressLevel", event.record.stressLevel
            ? t(`task.priority.${event.record.stressLevel}`) : "–"],
          ["log.defoliationStyle", event.record.defoliationStyle ?? "–"],
          ["log.defoliationPercent", event.record.defoliationPercent != null
            ? `${event.record.defoliationPercent}%` : "–"],
          ["log.fermentationNote", event.record.fermentationNote ?? "–"],
          ["nav.plants", event.plants?.length
            ? event.plants.map((p) => p.name).join(", ") : "–"]
        ];
      case "equipmentPurchase":
        return [
          ["equipment.cost", event.record.cost != null ? `${event.record.cost} ${event.record.currency ?? ""}`.trim() : "–"],
          ["equipment.purchaseDate", event.record.purchaseDate ?? "–"],
          ["equipment.status", t(`equipment.status.${event.record.status}`)]
        ];
      case "growStart":
      case "growEnd":
        return [
          ["common.date", event.at],
          ["grow.status", t(`grow.status.${event.record.status}`)],
          ["common.notes", event.record.notes ?? "–"]
        ];
      default:
        return (event.fields ?? []).map(([k, v]) => [k, fmt(v)]);
    }
  }

  function titleFor(event) {
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const plantSuffix = event.plant ? ` — ${event.plant.name}` : "";
    switch (event.kind) {
      case "stage": return `${t("stages." + event.record.stage)}${plantSuffix}`;
      case "locationChange": return `${t("history.locationChange")}${plantSuffix}`;
      case "taskPlanned": return `${t("history.taskPlanned")}: ${event.title}`;
      case "taskDone": return `${t("history.taskDone")}: ${event.title}`;
      case "taskSkipped": return `${t("history.taskSkipped")}: ${event.title}`;
      case "growStart": return `${t("timeline.growStart", { name: event.title })}`;
      case "growEnd": return `${t("timeline.growEnd", { name: event.title })}`;
      case "harvest": return `${t("timeline.harvest", { name: event.title })}`;
      case "measurement": return `${t("history.measurement")}${plantSuffix}`;
      case "equipmentPurchase": return `${t("history.equipmentPurchase")}: ${event.title}`;
      case "equipmentAssignment": return `${t("history.equipmentAssignment")}: ${event.title}`;
      case "germination": return `${t("history.germination")}: ${event.title}`;
      case "photo": return `${t("nav.plants")}: ${event.plant?.name ?? ""}`;
      case "log": return `${t("log.title")}: ${window.LeafGuru.logDomain?.summaryLine?.(event.record) ?? event.title}`;
      default: return event.title || event.kind;
    }
  }

  /**
   * Open the popup for an event. The dialog element is provided by the
   * page ([data-event-popup] + [data-popup-title/body/close]); a fresh
   * dialog is auto-created when the page doesn't supply one.
   */
  function open(event, { dialog } = {}) {
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    let dlg = dialog ?? document.querySelector("[data-event-popup]");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.setAttribute("data-event-popup", "");
      dlg.className = "crud-dialog event-popup";
      const h2 = document.createElement("h2");
      h2.setAttribute("data-popup-title", "");
      const dl = document.createElement("dl");
      dl.setAttribute("data-popup-body", "");
      dlg.append(h2, dl);
      document.body.append(dlg);
      window.LeafGuru.ui.wireBackdropClose();
    }

    dlg.querySelector("[data-popup-title]").textContent =
      `${ICONS[event.kind] ?? "•"} ${titleFor(event)}`;
    const body = dlg.querySelector("[data-popup-body]");
    body.replaceChildren();

    // meta line: date (+ range), plant, location
    const dateFormat = window.LeafGuru.format;
    const meta = [["common.date",
      dateFormat.date(event.at) + (event.atEnd ? ` → ${dateFormat.date(event.atEnd)}` : "")]];
    if (event.plant) meta.push(["nav.plants", event.plant.name]);
    if (event.location) meta.push(["nav.locations", event.location.name]);

    const dl = [];
    for (const [label, value] of [...meta, ...detailLines(event)]) {
      const shownValue = label.startsWith("task.priority.") || label.startsWith("equipment.status.")
        ? t(value) : value;
      dl.push({ label: t(label), value: shownValue });
    }

    for (const { label, value } of dl) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = fmt(value);
      body.append(dt, dd);
    }

    // raw record dump (max verbose) — folded by default, click to expand
    const rawHeading = document.createElement("dt");
    rawHeading.textContent = t("history.rawRecord");
    const rawToggle = document.createElement("button");
    rawToggle.type = "button";
    rawToggle.className = "event-popup__raw-toggle";
    const raw = document.createElement("dd");
    raw.className = "event-popup__raw";
    raw.hidden = true;
    raw.textContent = JSON.stringify(event.record, null, 2);
    rawToggle.addEventListener("click", () => {
      raw.hidden = !raw.hidden;
      rawToggle.textContent = t(raw.hidden ? "history.rawShow" : "history.rawHide");
      rawToggle.setAttribute("aria-expanded", String(!raw.hidden));
    });
    rawToggle.textContent = t("history.rawShow");
    rawToggle.setAttribute("aria-expanded", "false");
    const rawWrap = document.createElement("dd");
    rawWrap.append(rawToggle);
    body.append(rawHeading, rawWrap, raw);

    // change log of the entity (traceable edits)
    if (window.LeafGuru.storage?.editsOf) {
      const fmt2 = window.LeafGuru.format;
      const editsHeading = document.createElement("dt");
      editsHeading.textContent = t("history.changeLog");
      const editsWrap = document.createElement("dd");
      window.LeafGuru.storage.editsOf(entityOfEvent(event), event.record.id).then((edits) => {
        const list = document.createElement("ul");
        list.className = "event-popup__edits";
        if (!edits.length) {
          const li = document.createElement("li");
          li.className = "muted";
          li.textContent = t("history.noEdits");
          list.append(li);
        }
        for (const edit of edits) {
          const li = document.createElement("li");
          const summary = edit.changes?.length
            ? edit.changes.map((c) =>
              `${c.key}: ${shortValue(c.from)} → ${shortValue(c.to)}`).join(", ")
            : "–";
          li.textContent = `${fmt2.dateTime(edit.at)} · ${summary}`;
          list.append(li);
        }
        editsWrap.replaceChildren(list);
      });
      body.append(editsHeading, editsWrap);
    }

    // linked photos (journal entries): thumbnails via object URLs
    if (event.kind === "log" && window.LeafGuru.historyView._linkedPhotos?.length) {
      const photoHeading = document.createElement("dt");
      photoHeading.textContent = t("plant.photos");
      const photoWrap = document.createElement("dd");
      const grid = document.createElement("div");
      grid.className = "event-popup__photos";
      for (const photo of window.LeafGuru.historyView._linkedPhotos) {
        if (photo.logEntryId !== event.record.id) continue;
        const fig = document.createElement("figure");
        fig.className = "photo-card";
        const img = document.createElement("img");
        img.alt = photo.note || "photo";
        img.loading = "lazy";
        grid.append(fig);
        fig.append(img);
        window.LeafGuru.photos.urlFor(photo).then((url) => { img.src = url; });
      }
      photoWrap.append(grid);
      body.append(photoHeading, photoWrap);
    }

    // delete action for journal entries
    const actionsRow = dlg.querySelector(".crud-dialog-actions");
    if (event.kind === "log" && actionsRow && !dlg._logDeleteWired) {
      dlg._logDeleteWired = true;
      const del = document.createElement("button");
      del.type = "button";
      del.setAttribute("data-popup-delete", "");
      del.className = "event-popup__delete";
      del.textContent = t("common.delete");
      del.addEventListener("click", async () => {
        if (!window.confirm(t("messages.confirmDelete", { name: event.title.slice(0, 60) }))) return;
        await window.LeafGuru.storage.delete("logEntries", event.record.id);
        for (const photo of window.LeafGuru.historyView._linkedPhotos ?? []) {
          if (photo.logEntryId === event.record.id) await window.LeafGuru.storage.delete("photos", photo.id);
        }
        dlg.close();
        window.LeafGuru.historyView.onLogDeleted?.();
      });
      actionsRow.prepend(del);
    }

    dlg.showModal();
    return dlg;
  }

  window.LeafGuru.historyView = {
    open, titleFor, detailLines, icons: ICONS,
    /** per-open context set by the calling page before open() */
    _linkedPhotos: [], _pendingUrls: [],
    onLogDeleted: null
  };
})();