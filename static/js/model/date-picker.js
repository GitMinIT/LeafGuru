/**
 * LeafGuru — date/time picker widget.
 *
 * Click on any `data-date-input` / `data-datetime-input` opens a small
 * calendar popover (month grid like the timeline) and — for datetime
 * inputs — a clock row (hour/minute selects + apply). Values are written
 * through the settings-aware format module, so the widget respects
 * dateFormat / hourFormat / timezone everywhere. Zero dependencies.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  let popover = null;
  let activeInput = null;
  let view = null;        // { year, month } calendar view state
  let selectedDay = null; // picked day awaiting a time (datetime inputs)

  const MONTHS_FALLBACK = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function el(tag, cls) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function createPopover() {
    const box = document.createElement("div");
    box.className = "date-picker";
    box.hidden = true;
    document.body.append(box);
    // close on outside click
    document.addEventListener("click", (event) => {
      if (box.hidden) return;
      if (event.target === box || box.contains(event.target)) return;
      if (event.target === activeInput) return;
      hide();
    });
    return box;
  }

  function hide() {
    if (popover) popover.hidden = true;
    activeInput = null;
    view = null;
    selectedDay = null;
  }

  function fmt() { return window.LeafGuru.format; }
  function settings() { return window.LeafGuru.settings.all(); }
  function tr(key) { return window.LeafGuru.i18n.t(key); }

  /** current input value as ISO; date-only inputs anchor at noon */
  function inputValue(input) {
    let iso = window.LeafGuru.dateInput.parse(input);
    if (iso && "dateInput" in input.dataset) return `${iso}T12:00:00Z`;
    return iso ?? new Date().toISOString();
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  function commit(iso) {
    if (!iso || !activeInput) return;
    window.LeafGuru.dateInput.set(activeInput, iso);
    selectedDay = null;
    hide();
  }

  function render() {
    const f = fmt();
    const s = settings();
    const current = f.partsIn(inputValue(activeInput), s.timezone);
    if (!view) view = { year: Number(current.year), month: Number(current.month) - 1 };

    popover.replaceChildren();

    // header: month label + navigation
    const head = document.createElement("div");
    head.className = "date-picker__head";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "‹";
    prev.addEventListener("click", () => {
      view.month--; if (view.month < 0) { view.month = 11; view.year--; }
      render();
    });
    const label = document.createElement("strong");
    const months = tr("calendar.months") ?? MONTHS_FALLBACK;
    label.textContent = `${months[view.month]} ${view.year}`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "›";
    next.addEventListener("click", () => {
      view.month++; if (view.month > 11) { view.month = 0; view.year++; }
      render();
    });
    head.append(prev, label, next);

    const grid = document.createElement("div");
    grid.className = "date-picker__grid";
    const today = f.partsIn(new Date().toISOString(), s.timezone);
    for (let day = 1; day <= daysInMonth(view.year, view.month); day++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "date-picker__day";
      cell.textContent = String(day);
      if (Number(current.year) === view.year && Number(current.month) - 1 === view.month
        && Number(current.day) === day) cell.classList.add("date-picker__day--selected");
      if (Number(today.year) === view.year && Number(today.month) - 1 === view.month
        && Number(today.day) === day) cell.classList.add("date-picker__day--today");
      cell.addEventListener("click", () => pickDate(day));
      grid.append(cell);
    }

    popover.append(head, grid);

    // clock row for datetime inputs
    if (!("dateInput" in activeInput.dataset)) {
      const p = f.partsIn(inputValue(activeInput), s.timezone);
      const clock = document.createElement("div");
      clock.className = "date-picker__clock";
      const hourSel = document.createElement("select");
      const minSel = document.createElement("select");
      for (let h = 0; h < 24; h++) {
        const hourStr = String(h).padStart(2, "0");
        hourSel.append(new Option(
          s.hourFormat === "h12" ? `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}` : hourStr,
          hourStr));
      }
      for (let m = 0; m < 60; m += 5) minSel.append(new Option(String(m).padStart(2, "0"), String(m)));
      hourSel.value = String(Number(p.hours));
      minSel.value = String(Math.round(Number(p.minutes) / 5) * 5);
      const at = document.createElement("span");
      at.className = "muted";
      at.textContent = tr("common.at");
      const apply = document.createElement("button");
      apply.type = "button";
      apply.textContent = tr("common.save");
      apply.addEventListener("click", () => {
        const day = selectedDay ?? Number(p.day);
        commit(f.toIso(view.year, view.month + 1, day, hourSel.value, minSel.value, s));
      });
      clock.append(hourSel, minSel, apply);
      popover.append(clock);
    }

    popover.hidden = false;
    const rect = activeInput.getBoundingClientRect?.() ?? { left: 20, bottom: 40 };
    popover.style.left = `${Math.max(8, Math.min(Number(rect.left) || 20, (window.innerWidth ?? 800) - 270))}px`;
    popover.style.top = `${Math.max(8, (Number(rect.bottom) || 40) + 4)}px`;
  }

  function open(input) {
    popover = popover ?? createPopover();
    activeInput = input;
    view = null;
    selectedDay = null;
    render();
  }

  function pickDate(day) {
    selectedDay = day;
    const f = fmt();
    const s = settings();
    if ("dateInput" in activeInput.dataset) {
      // date-only: commit immediately (noon anchor keeps the calendar day)
      commit(f.toIso(view.year, view.month + 1, day, 12, 0, s));
    } else {
      render(); // stay open — the clock row commits date + time
    }
  }

  window.LeafGuru.dateTimePicker = {
    bind() {
      document.addEventListener("click", (event) => {
        const input = event.target.closest?.("[data-date-input],[data-datetime-input]");
        if (!input) return;
        // ignore clicks while the picker itself is open on this input
        if (popover && !popover.hidden && activeInput === input
          && (popover.contains(event.target) || event.target === input)) return;
        open(input);
      });
    },
    hide
  };
})();