/*
LeafGuru — sensors page controller.

The page where the environment shows up: the latest readings, whether
they sit inside the comfortable band, and a way to add a reading by
hand. A device posts to the same API, so the page works with no
hardware at all — and starts making sense the moment some arrives.

It is deliberately calm: a reading outside the band is marked, not
alarmed about. The hint engine is the part that speaks up; this page
just shows the numbers.
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
    const sensor = window.LeafGuru.sensorDomain;
    const fmt = window.LeafGuru.format;

    let state = { readings: [], grows: [], plants: [], locations: [] };
    let metricFilter = "";

    async function load() {
      const [readings, grows, plants, locations] = await Promise.all([
        storage.list("sensorReadings"),
        storage.list("grows"),
        storage.list("plants"),
        storage.list("locations")
      ]);
      state = { readings, grows, plants, locations };
    }

    // --- the latest reading of every metric ---------------------------
    function renderLatest() {
      const ul = $("[data-sensor-latest]");
      ul.replaceChildren();
      const latest = sensor.latestByMetric(state.readings);

      // show every metric we know, so an empty one is a visible gap
      // rather than a missing card
      const metrics = sensor.METRIC_KEYS.filter((m) => !metricFilter || m === metricFilter);
      const empty = $("[data-sensor-latest-empty]");
      empty.hidden = state.readings.length > 0;
      ul.hidden = state.readings.length === 0;

      for (const metric of metrics) {
        const reading = latest[metric];
        const li = document.createElement("li");
        li.className = "sensor-card";

        const name = document.createElement("div");
        name.className = "sensor-card__name";
        name.textContent = sensor.METRICS[metric].label;

        const value = document.createElement("div");
        value.className = "sensor-card__value";
        value.textContent = reading ? sensor.format(reading.value, metric) : "–";

        const band = document.createElement("div");
        band.className = "sensor-card__band muted";
        const range = sensor.rangeFor(metric);
        band.textContent = range
          ? `${t("sensor.band")}: ${range[0]}–${range[1]}${sensor.METRICS[metric].unit ? " " + sensor.METRICS[metric].unit : ""}`
          : t("sensor.noReadings");

        li.append(name, value, band);

        if (reading) {
          const inside = sensor.inRange(reading.value, range);
          const age = sensor.ageHours(reading);
          if (inside === false) {
            li.classList.add("sensor-card--out");
            const note = document.createElement("div");
            note.className = "sensor-card__note";
            note.textContent = t("sensor.outOfBand");
            li.append(note);
          } else if (inside === true) {
            li.classList.add("sensor-card--ok");
          }
          const when = document.createElement("div");
          when.className = "sensor-card__when muted";
          when.textContent = age == null
            ? t("sensor.never")
            : age < 1
              ? fmt.dateTime(reading.recordedAt)
              : t("sensor.stale", { hours: age });
          li.append(when);
        } else {
          li.classList.add("sensor-card--empty");
        }
        ul.append(li);
      }
    }

    // --- the reading history ------------------------------------------
    function renderHistory() {
      const ul = $("[data-sensor-history]");
      ul.replaceChildren();
      let readings = state.readings.slice().sort(
        (a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""));
      if (metricFilter) readings = readings.filter((r) => r.metric === metricFilter);

      const empty = $("[data-sensor-history-empty]");
      empty.hidden = readings.length > 0;
      ul.hidden = readings.length === 0;

      for (const reading of readings.slice(0, 100)) {
        const li = document.createElement("li");
        li.className = "sensor-row";

        const metric = document.createElement("span");
        metric.className = "sensor-row__metric";
        metric.textContent = sensor.METRICS[reading.metric]?.label ?? reading.metric;

        const value = document.createElement("span");
        value.className = "sensor-row__value";
        value.textContent = sensor.format(reading.value, reading.metric);

        const when = document.createElement("span");
        when.className = "muted";
        when.textContent = fmt.dateTime(reading.recordedAt);

        const where = document.createElement("span");
        where.className = "muted";
        const grow = state.grows.find((g) => g.id === reading.growId);
        const location = state.locations.find((l) => l.id === reading.locationId);
        where.textContent = grow?.name ?? location?.name ?? "";

        const device = document.createElement("span");
        device.className = "muted";
        device.textContent = reading.deviceId || t("sensor.noDevice");

        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn--danger";
        del.textContent = t("common.delete");
        del.addEventListener("click", async () => {
          await storage.delete("sensorReadings", reading.id);
          await load();
          renderAll();
        });

        li.append(metric, value, when, where, device, del);
        ul.append(li);
      }
    }

    // --- the add-reading dialog ----------------------------------------
    function fillDialog() {
      const growSel = $("[data-sensor-grow]");
      growSel.replaceChildren(new Option(t("common.none"), ""));
      for (const g of state.grows) growSel.append(new Option(g.name, g.id));

      const locSel = $("[data-sensor-location]");
      locSel.replaceChildren(new Option(t("common.none"), ""));
      for (const l of state.locations) locSel.append(new Option(l.name, l.id));

      const plantSel = $("[data-sensor-plants]");
      plantSel.replaceChildren();
      for (const p of state.plants.filter((p) => p.status === "growing")
        .sort((a, b) => a.name.localeCompare(b.name))) {
        plantSel.append(new Option(p.name, p.id));
      }

      const deviceSel = $("[data-sensor-device]");
      const devices = [...new Set(state.readings.map((r) => r.deviceId).filter(Boolean))];
      deviceSel.replaceChildren(new Option(t("sensor.noDevice"), ""));
      for (const d of devices) deviceSel.append(new Option(d, d));
    }

    function openDialog() {
      fillDialog();
      fillMetricSelects();
      const errEl = $("[data-sensor-error]");
      errEl.hidden = true;
      errEl.textContent = "";
      $("[data-sensor-form]").reset();
      $("[data-sensor-value]").value = "";
      $("[data-sensor-when]").value = "";
      window.LeafGuru.dateInput.set($("[data-sensor-when]"), new Date().toISOString());
      $("[data-sensor-dialog]").showModal();
    }

    async function submit(event) {
      event.preventDefault();
      const errEl = $("[data-sensor-error]");
      const metric = $("[data-sensor-metric]").value;
      const raw = $("[data-sensor-value]").value;
      if (!metric) {
        errEl.textContent = t("sensor.metric");
        errEl.hidden = false;
        return;
      }
      if (raw === "" || Number.isNaN(Number(raw))) {
        errEl.textContent = t("sensor.value");
        errEl.hidden = false;
        return;
      }
      try {
        const reading = sensor.buildReading({
          metric,
          value: raw,
          unit: sensor.METRICS[metric].unit || null,
          recordedAt: window.LeafGuru.dateInput.parse($("[data-sensor-when]")),
          growId: $("[data-sensor-grow]").value || null,
          locationId: $("[data-sensor-location]").value || null,
          plantId: [...$("[data-sensor-plants]").selectedOptions].map((o) => o.value)[0] ?? null,
          deviceId: $("[data-sensor-device]").value || null,
          source: $("[data-sensor-device]").value ? "device" : "manual"
        });
        await storage.put("sensorReadings", reading);
        $("[data-sensor-dialog]").close();
        await load();
        renderAll();
      } catch (e) {
        errEl.textContent = e.name === "LeafGuruValidationError"
          ? window.LeafGuru.ui.formatErrors(e) : e.message;
        errEl.hidden = false;
      }
    }

    // --- the metric lists (the filter and the dialog share them) -------
    function fillMetricSelects() {
      for (const sel of [$("[data-sensor-filter]"), $("[data-sensor-metric]")]) {
        if (!sel) continue;
        const isFilter = sel.hasAttribute("data-sensor-filter");
        sel.replaceChildren(new Option(isFilter ? t("sensor.allMetrics") : "—", ""));
        for (const key of sensor.METRIC_KEYS) {
          sel.append(new Option(sensor.METRICS[key].label, key));
        }
      }
    }

    function renderAll() {
      renderLatest();
      renderHistory();
    }

    fillMetricSelects();
    await load();
    renderAll();

    $("[data-sensor-new]").addEventListener("click", openDialog);
    $("[data-sensor-form]").addEventListener("submit", submit);
    $("[data-sensor-filter]").addEventListener("change", (e) => {
      metricFilter = e.target.value;
      renderAll();
    });
  });
})();
