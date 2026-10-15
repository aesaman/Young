import { toFaDigits, formatShort, MONTHS, parseKey } from "./shamsi.js";

/**
 * Professional monthly line chart.
 * X axis = day of month, Y axis = value with readable ticks.
 */
export function lineChart(container, points, color, unitLabel) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";

  const w = 720;
  const h = 280;
  const pad = { l: 48, r: 16, t: 28, b: 40 };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");

  const vals = points.map((p) => Number(p.value) || 0);
  const rawMax = Math.max(...vals, 0);
  // nice max for Y scale
  const niceMax = (() => {
    if (rawMax <= 0) return 1;
    const exp = Math.floor(Math.log10(rawMax));
    const f = rawMax / Math.pow(10, exp);
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  })();
  const max = Math.max(niceMax, 1);
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - (v / max) * innerH;

  // background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", pad.l);
  bg.setAttribute("y", pad.t);
  bg.setAttribute("width", innerW);
  bg.setAttribute("height", innerH);
  bg.setAttribute("fill", "rgba(255,255,255,0.02)");
  bg.setAttribute("rx", "8");
  svg.appendChild(bg);

  // horizontal grid + Y labels
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const gv = (max * i) / ticks;
    const gy = y(gv);
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
    grid.setAttribute("x1", pad.l);
    grid.setAttribute("x2", w - pad.r);
    grid.setAttribute("y1", gy);
    grid.setAttribute("y2", gy);
    grid.setAttribute("stroke", "rgba(255,255,255,0.08)");
    grid.setAttribute("stroke-width", "1");
    svg.appendChild(grid);
    const lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lab.setAttribute("x", pad.l - 8);
    lab.setAttribute("y", gy + 4);
    lab.setAttribute("text-anchor", "end");
    lab.setAttribute("class", "axis");
    lab.textContent = toFaDigits(String(Math.round(gv * 10) / 10));
    svg.appendChild(lab);
  }

  if (points.length) {
    // area
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("d", `${d} L${x(points.length - 1)} ${pad.t + innerH} L${x(0)} ${pad.t + innerH} Z`);
    area.setAttribute("fill", color);
    area.setAttribute("opacity", "0.14");
    svg.appendChild(area);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", d);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "2.6");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    // points + value labels for non-zero
    points.forEach((p, i) => {
      const cx = x(i);
      const cy = y(p.value);
      if (p.value > 0 || points.length <= 12) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", cx);
        c.setAttribute("cy", cy);
        c.setAttribute("r", p.value > 0 ? "3.2" : "2");
        c.setAttribute("fill", color);
        c.setAttribute("stroke", "#0a0c10");
        c.setAttribute("stroke-width", "1");
        svg.appendChild(c);
      }
      if (p.value > 0 && (points.length <= 14 || i % 2 === 0)) {
        const vt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        vt.setAttribute("x", cx);
        vt.setAttribute("y", cy - 8);
        vt.setAttribute("text-anchor", "middle");
        vt.setAttribute("class", "val");
        vt.textContent = toFaDigits(String(Math.round(p.value * 10) / 10));
        svg.appendChild(vt);
      }
    });
  }

  // X labels (day numbers)
  const labelEvery = points.length > 20 ? 5 : points.length > 12 ? 3 : 1;
  points.forEach((p, i) => {
    if (i % labelEvery && i !== 0 && i !== points.length - 1) return;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", x(i));
    t.setAttribute("y", h - 12);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "axis");
    const jd = parseKey(p.date)?.jd;
    t.textContent = jd != null ? toFaDigits(jd) : toFaDigits(i + 1);
    svg.appendChild(t);
  });

  // axis titles
  const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yTitle.setAttribute("x", 12);
  yTitle.setAttribute("y", 16);
  yTitle.setAttribute("class", "axis");
  yTitle.textContent = "مقدار";
  svg.appendChild(yTitle);

  const xTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
  xTitle.setAttribute("x", w / 2);
  xTitle.setAttribute("y", h - 2);
  xTitle.setAttribute("text-anchor", "middle");
  xTitle.setAttribute("class", "axis");
  xTitle.textContent = "روز ماه";
  svg.appendChild(xTitle);

  wrap.appendChild(svg);
  const cap = document.createElement("div");
  cap.className = "chart-cap";
  const sum = vals.reduce((a, b) => a + b, 0);
  const peak = Math.max(...vals, 0);
  cap.textContent = typeof unitLabel === "function"
    ? unitLabel(sum, max)
    : `مجموع ${toFaDigits(Math.round(sum * 10) / 10)} · بیشینه ${toFaDigits(Math.round(peak * 10) / 10)}`;
  wrap.appendChild(cap);
  container.appendChild(wrap);
}

export function monthKeys(year, month) {
  const days = [];
  for (let d = 1; d <= 31; d++) days.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return days;
}

export { MONTHS, formatShort };
