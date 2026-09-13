/**
 * LeafGuru — minimal SVG line chart (growth curves from measurements).
 * Zero dependencies: builds one <svg> element from {points, labels}.
 * Tested in tests/chart.test.js.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const NS = "http://www.w3.org/2000/svg";

  /**
   * Build a polyline chart of one measurement series.
   * @param {Array<{x: string, y: number}>} points chronological; x = ISO date,
   *   y = value (same unit). Empty/1-point series yield a placeholder note.
   * @param {{w?: number, h?: number, pad?: number, yLabel?: string}} opts
   * @returns {SVGElement}
   */
  function lineChart(points, opts = {}) {
    const { w = 560, h = 220, pad = 34, yLabel = "" } = opts;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("class", "chart");
    svg.setAttribute("role", "img");

    if (!points || points.length < 2) {
      const note = document.createElementNS(NS, "text");
      note.setAttribute("x", w / 2);
      note.setAttribute("y", h / 2);
      note.setAttribute("text-anchor", "middle");
      note.setAttribute("class", "chart-empty");
      note.textContent = points && points.length === 1
        ? String(points[0].y)
        : "–";
      svg.append(note);
      return svg;
    }

    const xs = points.map((p) => Date.parse(p.x));
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(0, ...ys), yMax = Math.max(...ys) || 1;
    const spanX = xMax - xMin || 1;
    const spanY = yMax - yMin || 1;
    const px = (x) => pad + ((x - xMin) / spanX) * (w - 2 * pad);
    const py = (y) => h - pad - ((y - yMin) / spanY) * (h - 2 * pad);

    // gridlines: 4 horizontal + y labels
    for (let i = 0; i <= 4; i++) {
      const y = yMin + (spanY * i) / 4;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", pad); line.setAttribute("x2", w - pad);
      line.setAttribute("y1", py(y)); line.setAttribute("y2", py(y));
      line.setAttribute("class", "chart-grid");
      svg.append(line);
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", pad - 6);
      label.setAttribute("y", py(y) + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "chart-label");
      const shown = spanY < 4 ? Math.round(y * 10) / 10 : Math.round(y);
      label.textContent = String(shown) + (i === 4 && yLabel ? " " + yLabel : "");
      svg.append(label);
    }

    // x labels: first + last date
    for (const [x, anchor] of [[xs[0], "start"], [xs[xs.length - 1], "end"]]) {
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", anchor === "start" ? pad : w - pad);
      label.setAttribute("y", h - 8);
      label.setAttribute("text-anchor", anchor);
      label.setAttribute("class", "chart-label");
      label.textContent = new Date(x).toISOString().slice(0, 10);
      svg.append(label);
    }

    // polyline
    const poly = document.createElementNS(NS, "polyline");
    poly.setAttribute("class", "chart-line");
    poly.setAttribute("points", points
      .map((p) => `${px(Date.parse(p.x))},${py(p.y)}`)
      .join(" "));
    svg.append(poly);

    // dots + title tooltips
    for (const p of points) {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", px(Date.parse(p.x)));
      dot.setAttribute("cy", py(p.y));
      dot.setAttribute("r", 3);
      dot.setAttribute("class", "chart-dot");
      const title = document.createElementNS(NS, "title");
      title.textContent = `${p.x.slice(0, 10)}: ${p.y}`;
      dot.append(title);
      svg.append(dot);
    }
    return svg;
  }

  /** measurement history → chart points (height-type measurements, chronological) */
  function seriesFromMeasurements(measurements, type = "height") {
    return (measurements ?? [])
      .filter((m) => m.type === type)
      .slice()
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      .map((m) => ({ x: m.measuredAt, y: m.value }));
  }

  window.LeafGuru.chart = { lineChart, seriesFromMeasurements };
})();