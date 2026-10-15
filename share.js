import { formatLong, toFaDigits } from "./shamsi.js";
import { formatHM } from "./timer.js";

function scorePercent(correct, wrong, blank) {
  const total = correct + wrong + blank;
  if (!total) return null;
  return ((correct * 3 - wrong) / (total * 3)) * 100;
}

export function buildReportModel(day, opts) {
  const subjects = Object.values(day.subjects || {}).filter((s) => {
    const used = s.studySec || s.testSec || s.correct || s.wrong || s.blank;
    return used || opts.includeEmpty;
  });
  let study = 0, test = 0, correct = 0, wrong = 0, blank = 0;
  subjects.forEach((s) => {
    study += s.studySec || 0;
    test += s.testSec || 0;
    correct += s.correct || 0;
    wrong += s.wrong || 0;
    blank += s.blank || 0;
  });
  return {
    date: day.date,
    dateLabel: formatLong(day.date),
    targetSec: day.targetSec || 0,
    study, test, correct, wrong, blank,
    total: study + test,
    sleep: day.sleep || null,
    subjects: subjects.map((s) => ({
      name: s.name,
      color: s.color,
      studySec: s.studySec || 0,
      testSec: s.testSec || 0,
      targetSec: s.targetSec || 0,
      correct: s.correct || 0,
      wrong: s.wrong || 0,
      blank: s.blank || 0,
      note: opts.notes ? s.dailyNote || "" : ""
    })),
    notes: opts.notes
  };
}

export async function renderShareCanvas(model, opts) {
  const w = 1080;
  const h = 1520;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#070709";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(230,168,23,0.45)";
  g.lineWidth = 2;
  g.strokeRect(36, 36, w - 72, h - 72);
  g.fillStyle = "#E6A817";
  g.font = "600 28px Tahoma, sans-serif";
  g.textAlign = "right";
  g.fillText("گزارش مطالعه", w - 72, 100);
  g.fillStyle = "#ffffff";
  g.font = "500 40px Tahoma, sans-serif";
  g.fillText(model.dateLabel, w - 72, 160);
  g.font = "400 26px Tahoma, sans-serif";
  g.fillStyle = "rgba(255,255,255,0.72)";
  const pct = model.targetSec ? Math.round((model.total / model.targetSec) * 100) : 0;
  const lines = [];
  if (opts.study) lines.push(`مطالعهٔ روز: ${formatHM(model.total)} از ${formatHM(model.targetSec)}  ·  ${pct}%`);
  if (opts.tests) lines.push(`تست: ${model.correct + model.wrong + model.blank}   صحیح ${model.correct}   غلط ${model.wrong}   نزده ${model.blank}`);
  if (opts.sleep && model.sleep?.bed && model.sleep?.wake) lines.push(`خواب ${model.sleep.bed} تا ${model.sleep.wake}`);
  lines.forEach((line, i) => g.fillText(line, w - 72, 230 + i * 42));
  let y = 380;
  if (opts.subjects) {
    model.subjects.forEach((s) => {
      if (y > h - 140) return;
      g.fillStyle = s.color || "#E6A817";
      g.fillRect(w - 88, y - 18, 10, 28);
      g.fillStyle = "#fff";
      g.font = "600 30px Tahoma, sans-serif";
      g.textAlign = "right";
      g.fillText(s.name, w - 108, y + 6);
      g.font = "400 24px Tahoma, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.78)";
      g.textAlign = "left";
      const sp = s.targetSec ? Math.round(((s.studySec + s.testSec) / s.targetSec) * 100) : 0;
      let detail = `${formatHM(s.studySec + s.testSec)}`;
      if (opts.study) detail += `  ·  مطالعه ${formatHM(s.studySec)}  تست ${formatHM(s.testSec)}`;
      if (opts.tests) detail += `  ·  ${s.correct}/${s.wrong}/${s.blank}`;
      detail += `  ·  ${sp}%`;
      g.fillText(detail, 72, y + 6);
      y += 64;
      if (opts.notes && s.note) {
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.font = "400 22px Tahoma, sans-serif";
        g.textAlign = "right";
        g.fillText(s.note.slice(0, 70), w - 108, y);
        y += 40;
      }
    });
  }
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.font = "400 20px Tahoma, sans-serif";
  g.textAlign = "right";
  g.fillText("رهگیر مطالعه کنکور  ·  گزارش فقط‌خواندنی", w - 72, h - 64);
  return c;
}

export function encodeSnapshot(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeSnapshot(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function scoreText(correct, wrong, blank) {
  const p = scorePercent(correct, wrong, blank);
  if (p == null || !Number.isFinite(p)) return "—";
  return `${toFaDigits(p.toFixed(1))}٪`;
}

export { scorePercent };
