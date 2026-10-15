/** Timer math based on real timestamps, not incremented counters. */

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function elapsedMs(timer, now = Date.now()) {
  if (!timer) return 0;
  const raw = timer.segments;
  const segs = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
  let ms = 0;
  for (const seg of segs) {
    if (!seg || seg.start == null) continue;
    const end = seg.end == null ? (timer.status === "running" ? now : seg.start) : seg.end;
    ms += Math.max(0, Number(end) - Number(seg.start));
  }
  return ms;
}

export function formatHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatHM(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHM(text) {
  const raw = String(text || "").trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const labeled = raw.match(/^(\d{1,3})\s*ساعت(?:\s*و\s*(\d{1,2})\s*دقیقه)?$/);
  if (labeled) {
    const h = Number(labeled[1]);
    const min = labeled[2] == null ? 0 : Number(labeled[2]);
    if (min > 59) return null;
    return h * 3600 + min * 60;
  }
  const minsOnly = raw.match(/^(\d{1,4})\s*دقیقه$/);
  if (minsOnly) return Number(minsOnly[1]) * 60;
  const m = raw.match(/^(\d{1,3})\s*[:٫.]\s*(\d{1,2})$/) || raw.match(/^(\d{1,3})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] == null ? 0 : Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || min < 0 || min > 59 || h > 99) return null;
  if (m[2] == null && h > 24) return h * 60;
  return h * 3600 + min * 60;
}

export function createTimer({ subjectId, activity, date }) {
  const now = Date.now();
  return {
    id: uid("ses"),
    subjectId,
    activity,
    date,
    status: "running",
    segments: [{ start: now, end: null }],
    createdAt: now,
    persisted: false
  };
}

export function pauseTimer(timer, now = Date.now()) {
  if (!timer || timer.status !== "running") return timer;
  const segments = timer.segments.map((s, i) => i === timer.segments.length - 1 && s.end == null ? { ...s, end: now } : s);
  return { ...timer, status: "paused", segments };
}

export function resumeTimer(timer, now = Date.now()) {
  if (!timer || timer.status !== "paused") return timer;
  return { ...timer, status: "running", segments: [...timer.segments, { start: now, end: null }] };
}

export function finishTimer(timer, now = Date.now()) {
  const paused = timer.status === "running" ? pauseTimer(timer, now) : timer;
  return { ...paused, status: "finished", finishedAt: now };
}
