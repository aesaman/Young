import * as shamsi from "./shamsi.js";
import * as db from "./db.js";
import * as timer from "./timer.js";
import { lineChart, monthKeys, MONTHS } from "./charts.js";
import { encodeSnapshot, decodeSnapshot } from "./share.js";
import * as sync from "./sync.js";
import * as skyMod from "./sky.js";
import * as examMod from "./exam.js";
import * as occasions from "./occasions.js";

const { formatLong, formatShort, todayKey, parseKey, daysInJalaliMonth, shiftKey, compareKeys } = shamsi;
const { formatHMS, elapsedMs, createTimer, pauseTimer, resumeTimer, finishTimer, uid } = timer;
const GOLD = "#E6A817";
const FA = "۰۱۲۳۴۵۶۷۸۹";
const DEFAULTS = [["زیست","#00A693"],["شیمی","#800040"],["فیزیک","#848482"],["ریاضی","#FF8200"],["زمین","#FE28A2"],["فارسی","#1C39BB"],["عربی","#93C572"],["دینی","#3E2723"],["انگلیسی","#FAD6A5"]];
const appEl = document.getElementById("app");
const miniEl = document.getElementById("mini");
const overlay = document.getElementById("overlay");
const sheet = document.getElementById("sheet");
const focusEl = document.getElementById("focus");
const printEl = document.getElementById("print");
const state = {
  today: todayKey(), viewing: todayKey(),
  settings: { dailyTargetSec: 10 * 3600, overlay: 0.45, timerFont: "system", appFont: "system", digits: "en", panelBgOpacity: 0.28, focusOverlay: 0.45, ripple: true, rippleColor: "#E6A817" },
  catalog: [], day: null, days: [], notes: [], sessions: [], timer: null, readonly: false, liveMode: false,
  panelBg: "", panelBgType: "", focusUrl: "", focusVideo: "",
  syncCode: "", firebase: null, skyCity: "tehran", weatherOn: false, weather: null,
  advisorInbox: [], advisorPresence: null, inboxSeenAt: 0, exams: [], focusImmersive: false, focusChromeTimer: null, deviceId: "", sunCache: null, customFonts: { timer: null, app: null }
};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "");
}
function dig(str) {
  const s = String(str);
  if (state.settings.digits !== "fa") return s;
  return s.replace(/\d/g, (d) => FA[d]);
}
function hm(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return dig(h + ":" + String(m).padStart(2, "0"));
}
function num(n, d = 0) {
  const v = Number.isFinite(n) ? (d ? n.toFixed(d) : String(Math.round(n))) : "0";
  return dig(v);
}
function clamp(n) { return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
function totalOf(s) { return (s.studySec || 0) + (s.testSec || 0); }
function liveBonus(subjectId, activity) {
  const t = state.timer;
  if (!t || t.status === "finished" || t.date !== state.viewing) return 0;
  if (subjectId && t.subjectId !== subjectId) return 0;
  if (activity && t.activity !== activity) return 0;
  if (t.status !== "running" && t.status !== "paused") return 0;
  return Math.round(elapsedMs(t) / 1000);
}
function subjectLive(s) {
  const bonusStudy = liveBonus(s.id, "study");
  const bonusTest = liveBonus(s.id, "test");
  return {
    studySec: (s.studySec || 0) + bonusStudy,
    testSec: (s.testSec || 0) + bonusTest,
    sum: (s.studySec || 0) + (s.testSec || 0) + bonusStudy + bonusTest
  };
}
function dayTotal(day) {
  let t = Object.values(day?.subjects || {}).reduce((a, s) => a + totalOf(s), 0);
  if (day?.date === state.viewing) t += liveBonus(null, null);
  return t;
}
function sleepDur(bed, wake) {
  const to = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null; };
  const b = to(bed), w = to(wake);
  if (b == null || w == null) return null;
  return w > b ? w - b : w + 86400 - b;
}
function snap(sub, order = 0) {
  return { id: sub.id, name: sub.name, color: sub.color, targetSec: sub.targetSec, studySec: 0, testSec: 0, correct: 0, wrong: 0, blank: 0, practice: 0, quality: 0, dailyNote: "", todos: [], order, updatedAt: 0 };
}
function hexOk(v) { return /^#[0-9a-fA-F]{6}$/.test(v); }
function sortedSubjects(day) {
  return Object.values(day.subjects || {}).sort((a, b) => {
    const ao = a.order ?? 9999, bo = b.order ?? 9999;
    if (ao !== bo) return ao - bo;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}
function touchSubject(s) {
  s.updatedAt = Date.now();
  const list = sortedSubjects(state.day).filter((x) => x.id !== s.id);
  s.order = 0;
  list.forEach((x, i) => { x.order = i + 1; });
}

document.getElementById("dock").onclick = (e) => {
  const nav = e.target.closest("[data-nav]")?.dataset.nav;
  if (!nav) return;
  // live advisor: only stats / history / subject deck
  if (state.liveMode) {
    if (nav === "history") return openHistoryLive();
    if (nav === "stats") return openStats();
    if (nav === "subj") { state.liveDeck = true; return renderSubjectDeck(); }
    return;
  }
  if (state.readonly) return;
  if (!state.day) return alert("برنامه هنوز آماده نیست");
  if (nav === "manage") openManage();
  if (nav === "history") openHistory();
  if (nav === "stats") openStats();
  if (nav === "share") openShare();
  if (nav === "exam") openExamHub();
};
appEl.onclick = (e) => {
  if (e.target.closest("[data-drag]")) return;
  const open = e.target.closest("[data-open]");
  if (open) return openMenu(open.dataset.open);
  if (e.target.closest("[data-today]")) {
    if (state.readonly || state.liveMode) return;
    return go(state.today);
  }
  if (e.target.closest("[data-note]")) return openNotes(e.target.closest("[data-note]").dataset.note);
  if (e.target.closest("[data-reset]")) {
    if (state.readonly || state.liveMode) return;
    return resetDay();
  }
  if (e.target.closest("[data-advisor]")) return openAdvisor();
};
let lastTap = { id: "", t: 0 };
function handleDblTarget(el) {
  if (!el) return;
  const key = el.dataset.dbl;
  if (!key) return;
  const now = Date.now();
  if (lastTap.id === key && now - lastTap.t < 450) {
    lastTap = { id: "", t: 0 };
    onDouble(key);
  } else {
    lastTap = { id: key, t: now };
  }
}
appEl.addEventListener("dblclick", (e) => {
  const el = e.target.closest("[data-dbl]");
  if (el) { e.preventDefault(); onDouble(el.dataset.dbl); }
});
appEl.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse" && e.detail === 2) return;
  const el = e.target.closest("[data-dbl]");
  if (!el) return;
  handleDblTarget(el);
});
miniEl.onclick = onMini;
window.addEventListener("scroll", () => { const s = document.querySelector(".sheen"); if (s) s.style.setProperty("--sheen", String(Math.round(window.scrollY * -0.2))); }, { passive: true });

async function boot() {
  if (location.hash.startsWith("#ro=")) return bootOfflineReport(location.hash.slice(4));
  if (location.hash.startsWith("#r=")) return renderReadonly(location.hash.slice(3));
  if (location.hash.startsWith("#deck=")) return bootDeckViewer(location.hash.slice(6));
  if (location.hash.startsWith("#live=")) return bootLiveViewer(location.hash.slice(6));
  state.settings = Object.assign(state.settings, (await db.kvGet("settings")) || {});
  let did = await db.kvGet("deviceId");
  if (!did) { did = uid("dev"); await db.kvSet("deviceId", did); }
  state.deviceId = did;
  state.syncCode = ((await db.kvGet("syncCode")) || "").toUpperCase();
  state.firebase = (await db.kvGet("firebase")) || null;
  state.skyCity = (await db.kvGet("skyCity")) || "tehran";
  state.weatherOn = !!(await db.kvGet("weatherOn"));
  state.inboxSeenAt = Number(await db.kvGet("inboxSeenAt")) || 0;
  state.exams = await db.all("exams").catch(() => []);
  state.catalog = await db.all("subjects");
  if (!state.catalog.length) {
    state.catalog = DEFAULTS.map(([name, color], i) => ({ id: uid("sub"), name, color, targetSec: 4 * 3600, active: true, createdAt: Date.now(), updatedAt: Date.now(), order: i }));
    for (const s of state.catalog) await db.put("subjects", s);
  }
  state.days = await db.all("days");
  state.notes = await db.all("notes");
  state.sessions = await db.all("sessions");
  state.timer = (await db.kvGet("activeTimer")) || null;
  const bg = await db.blobGet("panelBg");
  if (bg) { state.panelBg = URL.createObjectURL(bg); state.panelBgType = (await db.kvGet("panelBgType")) || "image"; }
  const img = await db.blobGet("focusImage"); if (img) state.focusUrl = URL.createObjectURL(img);
  const vid = await db.blobGet("focusVideo"); if (vid) state.focusVideo = URL.createObjectURL(vid);
  await ensure(state.today);
  state.viewing = state.today;
  state.day = await db.get("days", state.viewing);
  render();
  bindScoreBars();
  state.sunCache = null; // force recalculate after formula fix
  refreshWeather().catch(()=>{});
  if (state.timer && state.timer.status !== "finished") openRecover();
  startUiTick();
  if (navigator.onLine) {
    try {
      await sync.initSync(state.firebase);
      if (state.syncCode) {
        const code = state.syncCode.toUpperCase();
        await sync.subscribeBundle(code, onRemoteBundle);
        const applyInbox = async (list) => {
          state.advisorInbox = list || [];
          await db.kvSet("advisorInboxCache", state.advisorInbox);
          updateAdvisorBell();
          const chip = document.querySelector(".advisor-chip");
          if (chip) chip.outerHTML = advisorChipHtml();
        };
        await sync.subscribeInbox(code, applyInbox);
        if (sync.subscribeLastNote) {
          await sync.subscribeLastNote(code, async (note) => {
            if (!note || !note.at) return;
            // merge into inbox immediately
            const list = state.advisorInbox || [];
            if (!list.some((n) => n.id === note.id || (n.at === note.at && n.text === note.text))) {
              list.unshift({ id: note.id || ("ln" + note.at), ...note });
              await applyInbox(list);
            }
          });
        }
        try {
          const list0 = await sync.fetchInbox(code);
          if (list0?.length) await applyInbox(list0);
        } catch {}
        await sync.subscribePresence(code, state.viewing, (p) => { state.advisorPresence = p; updateAdvisorBell(); const c=document.querySelector(".advisor-chip"); if(c) c.outerHTML=advisorChipHtml(); });
        schedulePush();
        // periodic inbox refresh
        setInterval(async () => {
          if (!navigator.onLine || !state.syncCode) return;
          try {
            await sync.initSync(state.firebase);
            const list = await sync.fetchInbox(state.syncCode);
            if (list) {
              state.advisorInbox = list;
              await db.kvSet("advisorInboxCache", list);
              updateAdvisorBell();
            }
          } catch {}
        }, 20000);
      }
      await refreshWeather();
    } catch (e) { console.warn(e); }
  }
  window.addEventListener("online", () => {
    if (state.firebase) sync.initSync(state.firebase).then(() => {
      schedulePush();
      forceLivePush(true);
    });
    if (state.weatherOn) refreshWeather();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !state.liveMode && state.syncCode) {
      forceLivePush(true);
      schedulePush();
    }
  });
  // keep multi-device + live link fresh
  setInterval(() => {
    if (!navigator.onLine || !state.syncCode || state.liveMode) return;
    forcePush();
    forceLivePush(true);
  }, 3000);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    const t = todayKey();
    if (t !== state.today) { state.today = t; await ensure(t); if (state.viewing !== t) state.viewing = t; state.day = await db.get("days", state.viewing); render(); }
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((err) => console.warn("SW", err));
  }
  setupInstall();
  initRipple();
  applyCustomIcon();
  await loadStoredFonts();
  applyFonts();
  occasions.refreshOccasionsOnline().catch(() => {});
  // restore cached inbox offline
  const cachedInbox = await db.kvGet("advisorInboxCache");
  if (Array.isArray(cachedInbox) && !state.advisorInbox.length) state.advisorInbox = cachedInbox;
}
let deferredInstall = null;
function setupInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
}
async function promptInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone || window.matchMedia("(display-mode: minimal-ui)").matches;
  if (standalone) return alert("برنامه از قبل به‌صورت نصب‌شده باز است.");
  if (deferredInstall) {
    deferredInstall.prompt();
    try {
      const ch = await deferredInstall.userChoice;
      if (ch?.outcome === "accepted") deferredInstall = null;
    } catch {}
    return;
  }
  // try show install criteria hint
  const sw = navigator.serviceWorker?.controller;
  alert(
    "نصب اپ:\n" +
    "1) باید روی آدرس HTTPS باشد (نه فایل محلی)\n" +
    "2) Hard Reload بزن\n" +
    "3) کروم ⋮ → Install app / نصب برنامه\n" +
    (sw ? "Service Worker فعال است ✓" : "Service Worker هنوز فعال نیست — یک‌بار رفرش کامل کن")
  );
}

async function ensure(date) {
  let day = await db.get("days", date);
  if (!day) {
    day = { date, targetSec: state.settings.dailyTargetSec || 36000, sleep: null, subjects: {}, updatedAt: Date.now() };
    state.catalog.filter((s) => s.active !== false).forEach((s, i) => { day.subjects[s.id] = snap(s, i); });
    await db.put("days", day);
  } else if (date === todayKey()) {
    state.catalog.filter((s) => s.active !== false).forEach((s, i) => {
      if (!day.subjects[s.id]) day.subjects[s.id] = snap(s, i);
      else { day.subjects[s.id].name = s.name; day.subjects[s.id].color = s.color; day.subjects[s.id].targetSec = s.targetSec; }
    });
    await db.put("days", day);
  }
  return day;
}
async function saveDay() {
  state.day.updatedAt = Date.now();
  await db.put("days", state.day);
  const i = state.days.findIndex((d) => d.date === state.day.date);
  if (i >= 0) state.days[i] = state.day; else state.days.push(state.day);
  // immediate: live link + multi-device
  forceLivePush(true);
  forcePush();
}
let pushTimer = null, livePushTimer = null;
function scheduleLivePush(full = false) {
  clearTimeout(livePushTimer);
  livePushTimer = setTimeout(() => pushLiveNow(full), 20);
}
function forceLivePush(full = true) {
  clearTimeout(livePushTimer);
  return pushLiveNow(full);
}
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 120);
}
function forcePush() {
  clearTimeout(pushTimer);
  return pushNow();
}
async function pushNow() {
  if (!navigator.onLine || !state.syncCode || !sync.hasConfig(state.firebase)) return false;
  if (!(await sync.initSync(state.firebase))) return false;
  const bundle = await db.exportAll();
  bundle.deviceId = state.deviceId;
  bundle.pushedAt = Date.now();
  bundle.kv = bundle.kv || {};
  if (state.timer && state.timer.status && state.timer.status !== "finished") {
    bundle.kv.activeTimer = state.timer;
  } else {
    bundle.kv.activeTimer = { status: "off", at: Date.now() };
  }
  state._lastPush = bundle.pushedAt;
  const ok = await sync.pushBundle((state.syncCode || "").toUpperCase(), bundle);
  return ok;
}
async function pushLiveNow(full = true) {
  if (!state.syncCode || !sync.hasConfig(state.firebase)) return false;
  if (!navigator.onLine) return false;
  if (!(await sync.initSync(state.firebase))) return false;
  const code = (state.syncCode || "").toUpperCase();
  const date = state.viewing || state.today;
  if (!date) return false;
  let timerPayload = null;
  if (state.timer && state.timer.status && state.timer.status !== "finished") {
    try { timerPayload = normalizeTimer(JSON.parse(JSON.stringify(state.timer))); } catch { timerPayload = state.timer; }
  }
  const payload = {
    day: state.day,
    timer: timerPayload, // null → remote status "off"
    liveOk: true,
    pushedAt: Date.now()
  };
  if (full) {
    payload.days = (state.days || []).slice().sort((a, b) => compareKeys(b.date, a.date)).slice(0, 30);
    payload.catalog = state.catalog;
    payload.notes = state.notes || [];
  }
  const ok = await sync.pushLiveDay(code, date, payload);
  if (ok) state._lastLivePush = Date.now();
  return ok;
}
async function onRemoteBundle(bundle) {
  if (!bundle || state.readonly || state.liveMode) return;
  if (bundle.deviceId && bundle.deviceId === state.deviceId) {
    state._lastPull = Math.max(state._lastPull || 0, bundle.pushedAt || 0);
    return;
  }
  // only skip if we already applied this exact push
  if (bundle.pushedAt && state._lastPull && bundle.pushedAt <= state._lastPull) return;
  try {
    if (Array.isArray(bundle.days)) {
      for (const rd of bundle.days) {
        const local = await db.get("days", rd.date);
        if (!local || (rd.updatedAt || 0) > (local.updatedAt || 0)) {
          await db.put("days", rd);
          if (rd.date === state.viewing) state.day = rd;
        }
      }
      state.days = await db.all("days");
    }
    if (Array.isArray(bundle.subjects) && bundle.subjects.length) {
      for (const s of bundle.subjects) await db.put("subjects", s);
      state.catalog = await db.all("subjects");
    }
    if (Array.isArray(bundle.notes)) {
      for (const n of bundle.notes) await db.put("notes", n);
      state.notes = await db.all("notes");
    }
    if (Array.isArray(bundle.sessions)) {
      for (const s of bundle.sessions) await db.put("sessions", s);
      state.sessions = await db.all("sessions");
    }
    if (Array.isArray(bundle.exams)) {
      for (const e of bundle.exams) await db.put("exams", e);
      state.exams = await db.all("exams");
    }
    if (bundle.kv?.activeTimer) {
      const rt = normalizeTimer(bundle.kv.activeTimer);
      if (rt && rt.status && rt.status !== "finished" && rt.status !== "off") {
        const remoteStart = Number(rt.createdAt || rt.segments?.[0]?.start || 0);
        const localStart = Number(state.timer?.createdAt || state.timer?.segments?.[0]?.start || 0);
        if (!state.timer || state.timer.status === "finished" || remoteStart >= localStart) {
          state.timer = rt;
          await db.kvSet("activeTimer", rt);
        }
      } else {
        state.timer = null;
        await db.kvSet("activeTimer", null);
      }
    }
    state._lastPull = bundle.pushedAt || Date.now();
    state.day = await db.get("days", state.viewing) || state.day;
    render();
  } catch (e) { console.warn("remote merge", e); }
}

async function saveTimer() {
  await db.kvSet("activeTimer", state.timer);
  // 1) timer-only push FIRST so stop/pause always reaches live link
  if (state.syncCode && sync.hasConfig(state.firebase) && navigator.onLine) {
    try {
      if (await sync.initSync(state.firebase)) {
        const code = (state.syncCode || "").toUpperCase();
        const date = state.viewing || state.today;
        if (date && sync.pushLiveTimer) {
          await sync.pushLiveTimer(code, date, state.timer);
        }
      }
    } catch (e) { console.warn("timer-only push", e); }
  }
  // 2) full live + multi-device
  forceLivePush(true);
  forcePush();
}

let uiTickStarted = false;
function startUiTick() {
  if (uiTickStarted) return;
  uiTickStarted = true;
  let livePushCounter = 0;
  let skyCounter = 0;
  setInterval(() => {
    if (state.timer && state.timer.status !== "finished") {
      const clockTxt = formatHMS(elapsedMs(state.timer));
      const miniClock = miniEl.querySelector(".mini-clock");
      if (miniClock) miniClock.textContent = clockTxt;
      if (state.liveMode) {
        if (!miniEl.classList.contains("show")) renderLiveMini();
        else if (miniClock) miniClock.textContent = clockTxt;
      }
      const b = miniEl.querySelector("b");
      if (b) b.textContent = clockTxt;
      const c = focusEl.querySelector(".clock");
      if (c) c.textContent = clockTxt;
      if (state.timer.status === "running" && !state.liveMode) {
        updateLiveProgress();
        livePushCounter++;
        // light ~0.5s, full ~5s
        if (livePushCounter % 2 === 0) scheduleLivePush(false);
        if (livePushCounter % 20 === 0) scheduleLivePush(true);
      }
    }
    skyCounter++;
    if (skyCounter % 20 === 0) {
      const sky = document.getElementById("sky-body");
      if (sky) updateSkyDom(sky);
      const skyNow = document.querySelector("[data-sky-clock]");
      if (skyNow) {
        const info = skyInfo();
        skyNow.textContent = info.label;
        skyNow.classList.toggle("day", !!info.isDay);
        skyNow.classList.toggle("night", !info.isDay);
      }
    }
  }, 250);
}

function render() {
  const day = state.day; if (!day) return;
  const total = dayTotal(day), target = day.targetSec || 1, pct = clamp(total / target * 100), remain = Math.max(0, target - total), remainPct = clamp(100 - pct);
  const upd = day.updatedAt ? dig(new Date(day.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) : "—";
  const past = state.viewing !== state.today;
  const subjects = sortedSubjects(day);
  const motto = day.motto || "";
  const ro = state.readonly;
  appEl.innerHTML = `${past && !ro ? `<div class="past"><span>روز گذشته ${formatShort(state.viewing)}</span><button class="ghost" data-today>امروز</button></div>` : ""}
  ${ro ? `<div class="readonly-banner">نمایش فقط‌خواندنی — قابل ویرایش نیست</div>` : ""}
  <section class="glass" id="panel">${state.panelBg ? (state.panelBgType === "video" ? `<video class="panel-bg" src="${state.panelBg}" autoplay muted loop playsinline style="opacity:${state.settings.panelBgOpacity ?? 0.28}"></video>` : `<img class="panel-bg" alt="" src="${state.panelBg}" style="opacity:${state.settings.panelBgOpacity ?? 0.28}">`) : ""}<div class="sheen"></div>
    <div class="topbar topbar-3">
      <div class="when">
        <small>تاریخ</small>
        <b>${formatLong(state.viewing)}</b>
      </div>
      <div class="badge-hit" data-dbl="badge">${day.badge ? (day.badgeType === "video" ? `<video class="panel-badge" src="${day.badge}" autoplay muted loop playsinline></video>` : `<img class="panel-badge" alt="" src="${day.badge}">`) : `<span class="badge-spacer"></span>`}</div>
      <div class="upd">
        <small>آخرین به‌روزرسانی</small>
        <b data-live-upd>${upd}</b>
      </div>
    </div>
    ${!ro ? advisorChipHtml() : ""}
    <div class="motto-wrap">${ro ? (motto ? `<div class="motto">${escapeHtml(motto)}</div>` : "") : `<input class="motto-input" id="motto" type="text" maxlength="80" placeholder="متن دلخواه بالای پنل…" value="${escapeAttr(motto)}" />`}</div>
    ${qualityBlock(day, ro)}
    <div class="island island-daily">
      <div class="island-label">پیشرفت امروز</div>
      <div class="daily">${ring(pct, GOLD, num(Math.round(pct)) + "%", "پیشرفت روز")}
        <div>
          <div class="meter-top">
            <div><span class="k">مطالعه شده</span><span class="v" data-live-total>${hm(total)}</span></div>
            <div class="target-col"><span class="k target-k">هدف</span><span class="v" data-live-target>${hm(target)}</span></div>
          </div>
          <div class="track"><i data-live-bar style="width:${pct}%;background:${GOLD}"></i></div>
          <div class="meter-bot-row">
            <span class="meter-remain" data-live-remain>${hm(remain)} باقی مانده</span>
            <span data-live-pct>${num(remainPct)}%</span>
          </div>
        </div>
      </div>
      ${sleepBlock(day)}
    </div>
    <div class="island island-subjects">
      <div class="island-label">دروس</div>
      <div id="subjects">${subjects.map(subjectBlock).join("")}</div>
    </div>
    ${skyBlock()}
    ${ro ? "" : `<button class="ghost reset-day" data-reset>ریست این روز</button>`}
  </section>`;
  renderMini();
  bindDrag();
  document.querySelectorAll("[data-note-view]").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      openNotesView(el.dataset.noteView);
    };
  });
  document.querySelectorAll("[data-field-view]").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      const [sid, field] = el.dataset.fieldView.split(":");
      const titles = { topic: "مبحث مطالعه‌شده", masteryNote: "کیفیت یادگیری و تسلط", blockers: "مشکلات و موانع (فیدبک)" };
      openSubjectFieldView(sid, field, titles[field] || field);
    };
  });
  document.querySelectorAll("[data-todo-toggle]").forEach((el) => {
    el.onclick = async (e) => {
      e.stopPropagation();
      if (state.readonly) return;
      const [sid, ix] = el.dataset.todoToggle.split(":");
      const sub = state.day?.subjects?.[sid];
      if (!sub || !sub.todos?.[Number(ix)]) return;
      const t = sub.todos[Number(ix)];
      const cur = t.status || (t.done ? "done" : "open");
      const next = cur === "open" ? "half" : cur === "half" ? "done" : "open";
      t.status = next;
      t.done = next === "done";
      touchSubject(sub);
      await saveDay();
      render();
    };
  });
  const mottoEl = document.getElementById("motto");
  if (mottoEl && !state.readonly) {
    let mottoT;
    const saveMotto = async () => {
      state.day.motto = mottoEl.value.trim();
      await saveDay();
    };
    mottoEl.addEventListener("change", saveMotto);
    mottoEl.addEventListener("input", () => {
      clearTimeout(mottoT);
      mottoT = setTimeout(saveMotto, 600);
    });
  }
  document.querySelectorAll("[data-q]").forEach((b) => {
    b.onclick = async () => {
      if (state.readonly) return;
      state.day.dayQuality = b.dataset.q;
      await saveDay();
      render();
    };
  });
  applyFonts();
  const sky = document.getElementById("sky-body");
  if (sky) updateSkyDom(sky);
  document.querySelectorAll("video.panel-bg, .focus video").forEach(setupSeamlessVideo);
}

function qualityBlock(day, ro) {
  const q = day.dayQuality || "";
  const opts = [
    { id: "great", label: "عالی", c: "#3dd68c" },
    { id: "good", label: "خوب", c: "#7eb6ff" },
    { id: "mid", label: "متوسط", c: "#E6A817" },
    { id: "bad", label: "ضعیف", c: "#ff5d5d" }
  ];
  if (ro) {
    const hit = opts.find((o) => o.id === q);
    return hit ? `<div class="day-quality ro"><span style="color:${hit.c}">کیفیت روز: ${hit.label}</span></div>` : "";
  }
  return `<div class="day-quality" data-quality>
    <span class="dq-lab">کیفیت روز</span>
    <div class="dq-opts">${opts.map((o) => `<button type="button" class="dq ${q === o.id ? "on" : ""}" data-q="${o.id}" style="--qc:${o.c}">${o.label}</button>`).join("")}</div>
  </div>`;
}
function ring(pct, color, main, sub) {
  const c = 2 * Math.PI * 42, dash = clamp(pct) / 100 * c;
  return `<div class="ring"><svg width="108" height="108" viewBox="0 0 108 108"><circle cx="54" cy="54" r="42" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle cx="54" cy="54" r="42" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${c}"/></svg><div class="lab"><div><strong>${main}</strong><br><small>${sub}</small></div></div></div>`;
}
function sleepBlock(day) {
  let html = "";
  if (day.sleep?.bed && day.sleep?.wake) {
    const dur = sleepDur(day.sleep.bed, day.sleep.wake);
    const { jy, jm } = parseKey(day.date);
    const rows = state.days.filter((d) => d.date.startsWith(`${jy}-${String(jm).padStart(2, "0")}`) && d.sleep?.bed);
    const avg = rows.length ? rows.reduce((a, d) => a + (sleepDur(d.sleep.bed, d.sleep.wake) || 0), 0) / rows.length : dur;
    html += `<div class="sleep-grid"><div class="sq"><small>ساعت خواب</small><b>${dig(day.sleep.bed)}</b></div><div class="sq"><small>ساعت بیداری</small><b>${dig(day.sleep.wake)}</b></div><div class="sq"><small>مقدار خواب امروز</small><b>${hm(dur || 0)}</b></div><div class="sq"><small>میانگین مقدار ساعت خواب</small><b>${hm(avg || 0)}</b></div></div>`;
  }
  if (day.studyStart) {
    html += `<div class="study-start-row"><div class="sq study-start-sq"><small>تایم شروع درس</small><b>${dig(day.studyStart)}</b></div></div>`;
  }
  return html;
}
function scorePct(c, w, b) {
  const total = (c || 0) + (w || 0) + (b || 0);
  if (!total) return null;
  return ((c * 3 - w) / (total * 3)) * 100;
}
function subjectBlock(s) {
  const live = subjectLive(s);
  const sum = live.sum, pct = s.targetSec ? clamp(sum / s.targetSec * 100) : 0;
  const remain = Math.max(0, (s.targetSec || 0) - sum);
  const studyShare = sum ? live.studySec / sum * 100 : 0;
  const testShare = sum ? live.testSec / sum * 100 : 0;
  const c = s.correct || 0, w = s.wrong || 0, b = s.blank || 0;
  const tests = c + w + b;
  const denom = Math.max(1, tests);
  const neg = scorePct(c, w, b);
  const note = s.dailyNote || state.notes.find((n) => n.subjectId === s.id)?.text || "";
  const tActive = state.timer && state.timer.status !== "finished" && state.timer.subjectId === s.id;
  const showStudy = (s.studySec || 0) > 0 || (tActive && state.timer.activity === "study");
  const showTestTime = (s.testSec || 0) > 0 || (tActive && state.timer.activity === "test");
  const showTime = showStudy || showTestTime;
  const showTests = tests > 0;
  const showPractice = (s.practice || 0) > 0;
  return `<article class="subject" data-sid="${s.id}">
    <div class="subject-head">
      <button class="subject-name" data-open="${s.id}" style="color:${s.color}">${s.name}</button>
      <div style="display:flex;gap:8px;align-items:center"><span>${num(Math.round(pct))}%</span><span class="drag-handle" data-drag="${s.id}" title="نگه دار و جابه‌جا کن">⋮⋮</span></div>
    </div>
    <div class="track"><i data-live-subbar="${s.id}" style="width:${pct}%;background:${s.color}"></i></div>
    <div class="goal-line"><span data-live-subsum="${s.id}">${hm(sum)} مطالعه شده . هدف: ${hm(s.targetSec || 0)}</span><span class="remain-line">${hm(remain)} باقی مانده</span></div>
    ${showTime ? `<div class="split ${showStudy && showTestTime ? "" : "single"}">
      ${showStudy ? `<div>
        <div class="fine"><span data-dbl="study:${s.id}" class="tap-target">مطالعه / کلاس</span><span data-dbl="edit-study:${s.id}" class="tap-target time-hit">${hm(live.studySec)}</span></div>
        <div class="track thin" data-dbl="study:${s.id}"><i data-live-study="${s.id}" style="width:${studyShare}%;background:${s.color}"></i></div>
      </div>` : ""}
      ${showTestTime ? `<div class="test-col">
        <div class="mini-ring"><svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="5"/><circle cx="36" cy="36" r="28" fill="none" stroke="${s.color}" stroke-width="5" stroke-dasharray="${testShare / 100 * 176} 176"/></svg><span data-dbl="test:${s.id}" class="tap-target">تست</span></div>
        <div class="test-time time-hit" data-dbl="edit-test:${s.id}">${hm(live.testSec)}</div>
      </div>` : ""}
    </div>
    ${sum > 0 ? `<div class="share-pct">مطالعه/کلاس ${num(Math.round(studyShare))}% · تست ${num(Math.round(testShare))}%</div>` : ""}` : ""}
    ${showTests ? `<div class="tests">
      <div class="test-row"><span class="tl">صحیح</span><i class="tb ok" style="width:${(c / denom) * 100}%"></i><b>${num(c)}</b></div>
      <div class="test-row"><span class="tl">غلط</span><i class="tb bad" style="width:${(w / denom) * 100}%"></i><b>${num(w)}</b></div>
      <div class="test-row"><span class="tl">نزده</span><i class="tb blank" style="width:${(b / denom) * 100}%"></i><b>${num(b)}</b></div>
      <div class="test-sum"><span>مجموع تست ${num(tests)}</span><span>درصد با نمره منفی ${neg == null ? "—" : dig(neg.toFixed(1)) + "%"}</span></div>
    </div>` : ""}
    ${showPractice ? `<div class="practice-line">تمرین: ${num(s.practice || 0)}</div>` : ""}
    ${s.topic || s.masteryNote || s.blockers ? `<div class="meta-lines">
      ${s.topic ? `<button type="button" class="meta-line" data-field-view="${s.id}:topic">مبحث مطالعه‌شده</button>` : ""}
      ${s.masteryNote ? `<button type="button" class="meta-line" data-field-view="${s.id}:masteryNote">کیفیت یادگیری و تسلط</button>` : ""}
      ${s.blockers ? `<button type="button" class="meta-line" data-field-view="${s.id}:blockers">مشکلات و موانع (فیدبک)</button>` : ""}
    </div>` : ""}
    ${Array.isArray(s.todos) && s.todos.length ? `<div class="todo-inline">${s.todos.map((t,i)=>{
      const st = t.status || (t.done ? "done" : "open");
      const mark = st === "done" ? "✓" : st === "half" ? "◐" : "✕";
      const cls = st === "done" ? "st-done" : st === "half" ? "st-half" : "st-open";
      return `<div class="todo-line ${cls}" data-todo-toggle="${s.id}:${i}">
        <span class="todo-mark">${mark}</span>
        <span class="todo-text">${escapeHtml(t.text)}</span>
        ${t.range?`<span class="todo-time">${escapeHtml(t.range)}</span>`:""}
      </div>`;
    }).join("")}</div>` : ""}
    <div class="score-row">
      <span>نمره مطالعه</span>
      <div class="score-bar" data-score="${s.id}"><i style="width:${(s.quality || 0) * 10}%;background:${s.color}"></i></div>
      <span class="score-num">${num(s.quality || 0)}</span>
    </div>
    ${note ? `<div class="subject-note"${state.readonly || state.liveMode ? "" : ` data-note="${s.id}"`}>${escapeHtml(note)}</div>` : ""}
  </article>`;
}

function skyBlock() {
  const info = skyInfo();
  const wx = state.weatherOn ? (state.weather || skyMod.offlineWeatherHint(info.isDay)) : null;
  const city = info.city || skyMod.CITIES[0];
  const kind = info.isDay ? "sun" : "moon";
  const clockClass = info.isDay ? "sky-now day" : "sky-now night";
  return `<div class="island island-sky" data-dbl="sky">
    <div class="sky-topbar">
      <div class="island-label" style="margin:0">${info.isDay ? "آسمان روز" : "آسمان شب"} · ${city.name}</div>
      <b class="${clockClass}" data-sky-clock>${info.label}</b>
    </div>
    <div class="sky-card calm">
      <div class="sky-path calm-path">
        <div class="sky-glow"></div>
        <div class="sky-arc soft"></div>
        <span class="sky-end rise"><b>${dig(info.rise)}</b><small>طلوع</small></span>
        <span class="sky-end set"><b>${dig(info.set)}</b><small>غروب</small></span>
        <div id="sky-body" class="sky-body ${kind}" style="left:${info.x}%;top:${info.y}%"></div>
      </div>
      ${wx ? `<div class="sky-weather">${wx.icon} ${wx.label}${wx.temp != null ? " · " + dig(Math.round(wx.temp)) + "°" : ""}${wx.offline ? " (آفلاین)" : ""}</div>` : ""}
      <p class="sky-hint">دابل‌کلیک: شهر · طلوع چپ · غروب راست</p>
    </div>
  </div>`;
}
function skyInfo(now = new Date()) {
  const cityId = state.day?.skyCity || state.skyCity;
  const city = skyMod.CITIES.find((c) => c.id === cityId) || skyMod.CITIES[0];
  let riseMin, setMin;
  if (state.sunCache && state.sunCache.cityId === city.id && state.sunCache.dayKey === now.toDateString()) {
    riseMin = state.sunCache.riseMin; setMin = state.sunCache.setMin;
  } else {
    const t = skyMod.sunTimes(city.lat, city.lon, now, city.tz);
    riseMin = t.riseMin; setMin = t.setMin;
  }
  const pos = skyMod.skyPosition(now, riseMin, setMin, city.tz);
  // clock = city-local time (not device TZ)
  const lm = Math.floor(pos.localMins);
  const label = dig(String(Math.floor(lm / 60) % 24).padStart(2, "0") + ":" + String(lm % 60).padStart(2, "0"));
  return { ...pos, rise: skyMod.fmtMin(riseMin), set: skyMod.fmtMin(setMin), label, city };
}
function updateSkyDom(el) {
  if (!el) return;
  const info = skyInfo();
  el.style.left = info.x + "%";
  el.style.top = info.y + "%";
}
async function refreshWeather() {
  const cityId = state.day?.skyCity || state.skyCity;
  const city = skyMod.CITIES.find((c) => c.id === cityId) || skyMod.CITIES[0];
  try {
    if (navigator.onLine && skyMod.fetchSunTimes) {
      try {
        const st = await skyMod.fetchSunTimes(city.lat, city.lon);
        state.sunCache = { cityId: city.id, dayKey: new Date().toDateString(), riseMin: st.riseMin, setMin: st.setMin };
      } catch {}
    }
  } catch {}
  if (!state.weatherOn) return;
  const dayNight = skyInfo().isDay;
  try {
    if (navigator.onLine) state.weather = await skyMod.fetchWeather(city.lat, city.lon, dayNight);
    else state.weather = skyMod.offlineWeatherHint(dayNight);
  } catch {
    state.weather = skyMod.offlineWeatherHint(dayNight);
  }
  const el = document.querySelector(".sky-weather");
  if (el && state.weather) {
    const wx = state.weather;
    el.textContent = `${wx.icon} ${wx.label}${wx.temp != null ? " · " + Math.round(wx.temp) + "°" : ""}${wx.offline ? " (آفلاین)" : ""}`;
  }
}
function openSkySettings() {
  if (state.readonly || state.liveMode) return;
  openSheet(`<h3>آسمان و آب‌وهوا</h3>
    <div class="field"><label>شهر</label><select id="city">${skyMod.CITIES.map((c) => `<option value="${c.id}" ${c.id === state.skyCity ? "selected" : ""}>${c.name}</option>`).join("")}</select></div>
    <div class="field"><label><input type="checkbox" id="wx" ${state.weatherOn ? "checked" : ""}> نمایش آب‌وهوا</label></div>
    <p class="hint">طلوع/غروب بر اساس مختصات شهر محاسبه می‌شود؛ با اینترنت از Open-Meteo دقیق‌تر می‌شود.</p>
    <button class="primary" id="ok">ذخیره</button>`);
  sheet.querySelector("#ok").onclick = async () => {
    const city = sheet.querySelector("#city").value;
    state.skyCity = city;
    state.weatherOn = sheet.querySelector("#wx").checked;
    await db.kvSet("skyCity", state.skyCity);
    await db.kvSet("weatherOn", state.weatherOn);
    // per-day snapshot so past days stay unchanged
    if (state.day) {
      state.day.skyCity = city;
      await saveDay();
    }
    if (state.weatherOn) await refreshWeather();
    else state.weather = null;
    closeSheet(); render();
  };
}
function updateLiveProgress() {
  if (!state.day || state.readonly) return;
  const day = state.day;
  const total = dayTotal(day);
  const target = day.targetSec || 1;
  const pct = clamp(total / target * 100);
  const remain = Math.max(0, target - total);
  const elT = document.querySelector("[data-live-total]");
  const elR = document.querySelector("[data-live-remain]");
  const elB = document.querySelector("[data-live-bar]");
  const elP = document.querySelector("[data-live-pct]");
  if (elT) elT.textContent = hm(total);
  if (elR) elR.textContent = hm(remain) + " باقی مانده";
  const elTg = document.querySelector("[data-live-target]");
  if (elTg) elTg.textContent = hm(target);
  if (elB) elB.style.width = pct + "%";
  if (elP) elP.textContent = num(clamp(100 - pct)) + "%";
  // subject bars
  sortedSubjects(day).forEach((s) => {
    const live = subjectLive(s);
    const sum = live.sum;
    const sp = s.targetSec ? clamp(sum / s.targetSec * 100) : 0;
    const bar = document.querySelector(`[data-live-subbar="${s.id}"]`);
    const lab = document.querySelector(`[data-live-subsum="${s.id}"]`);
    if (bar) bar.style.width = sp + "%";
    if (lab) lab.textContent = `${hm(sum)} مطالعه شده . هدف: ${hm(s.targetSec || 0)}`;
  });
  scheduleLivePush();
}


function bindScoreBars() {
  if (appEl._scoreBound) return;
  appEl._scoreBound = true;
  let active = null;
  const setFromEvent = async (e, save) => {
    if (!active || !state.day) return;
    const bar = active;
    const id = bar.dataset.score;
    const s = state.day.subjects[id];
    if (!s) return;
    const rect = bar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let ratio = (clientX - rect.left) / rect.width;
    if (getComputedStyle(document.documentElement).direction === "rtl") ratio = 1 - ratio;
    const q = Math.max(0, Math.min(10, Math.round(ratio * 10)));
    s.quality = q;
    const fill = bar.querySelector("i");
    if (fill) fill.style.width = `${q * 10}%`;
    const numEl = bar.parentElement?.querySelector(".score-num");
    if (numEl) numEl.textContent = num(q);
    if (save) { touchSubject(s); await saveDay(); }
  };
  appEl.addEventListener("pointerdown", (e) => {
    const bar = e.target.closest("[data-score]");
    if (!bar) return;
    active = bar;
    bar.setPointerCapture?.(e.pointerId);
    setFromEvent(e, false);
  });
  appEl.addEventListener("pointermove", (e) => { if (active) setFromEvent(e, false); });
  appEl.addEventListener("pointerup", async (e) => { if (!active) return; await setFromEvent(e, true); active = null; });
  appEl.addEventListener("pointercancel", () => { active = null; });
}

function bindDrag() {
  const root = document.getElementById("subjects");
  if (!root || root._dragBound) return;
  root._dragBound = true;
  let dragId = null, holdTimer = null, holding = false;
  const clear = () => { clearTimeout(holdTimer); holding = false; dragId = null; root.querySelectorAll(".subject").forEach((el) => el.classList.remove("dragging")); };
  const onStart = (e) => {
    const handle = e.target.closest("[data-drag]");
    if (!handle) return;
    const id = handle.dataset.drag;
    holdTimer = setTimeout(() => { holding = true; dragId = id; handle.closest(".subject")?.classList.add("dragging"); }, 280);
  };
  const onMove = (e) => {
    if (!holding || !dragId) return;
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const el = document.elementFromPoint(x, y)?.closest(".subject");
    if (!el || el.dataset.sid === dragId) return;
    const list = sortedSubjects(state.day);
    const from = list.findIndex((s) => s.id === dragId);
    const to = list.findIndex((s) => s.id === el.dataset.sid);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    list.forEach((s, i) => { s.order = i; });
    render();
    const again = document.querySelector(`[data-sid="${dragId}"]`);
    if (again) again.classList.add("dragging");
  };
  const onEnd = async () => {
    if (holding && dragId) await saveDay();
    clear();
  };
  root.addEventListener("touchstart", onStart, { passive: true });
  root.addEventListener("mousedown", onStart);
  root.addEventListener("touchmove", onMove, { passive: false });
  root.addEventListener("mousemove", onMove);
  root.addEventListener("touchend", onEnd);
  root.addEventListener("mouseup", onEnd);
}

function renderMini() {
  const t = state.timer;
  miniEl.classList.remove("live-viewer");
  if (!t || t.status === "finished" || focusEl.classList.contains("open")) {
    miniEl.classList.remove("show");
    miniEl.innerHTML = "";
    miniEl.style.display = "";
    return;
  }
  const sub = state.catalog.find((s) => s.id === t.subjectId) || state.day?.subjects?.[t.subjectId];
  miniEl.classList.add("show");
  const act = t.activity === "test" ? "تست" : "مطالعه";
  const paused = t.status === "paused";
  miniEl.innerHTML = `
    <div class="mini-main">
      <div class="mini-meta">
        <span class="mini-name">${escapeHtml(sub?.name || "درس")}</span>
        <span class="mini-act">${act}${paused ? " · مکث" : ""}</span>
      </div>
      <div class="mini-clock">${formatHMS(elapsedMs(t))}</div>
    </div>
    <div class="mini-actions">
      <button type="button" class="ghost mini-btn" data-act="pause">${paused ? "ادامه" : "مکث"}</button>
      <button type="button" class="ghost mini-btn" data-act="full">تمام‌صفحه</button>
      <button type="button" class="ghost mini-btn" data-act="aot">شناور</button>
      <button type="button" class="danger mini-btn" data-act="finish">پایان</button>
    </div>`;
}
function onDouble(key) {
  if (!key) return;
  if (state.readonly || state.liveMode) return; // no edits on shared/live view
  if (key === "sky") return openSkySettings();
  if (key === "badge") return openBadgeEditor();
  if (key.startsWith("edit-study:")) return editTime(key.slice(11), "studySec");
  if (key.startsWith("edit-test:")) return editTime(key.slice(10), "testSec");
  if (key.startsWith("study:")) return startTimer(key.slice(6), "study");
  if (key.startsWith("test:")) return startTimer(key.slice(5), "test");
}
function openSheet(html) {
  sheet.innerHTML = html;
  overlay.classList.add("open");
  document.body.classList.add("sheet-open");
  sheet.querySelectorAll("[data-close]").forEach((b) => b.onclick = closeSheet);
  // hide live mini while sheet open
  if (state.liveMode) {
    miniEl.classList.remove("show");
    miniEl.innerHTML = "";
  }
}
function closeSheet() {
  overlay.classList.remove("open");
  document.body.classList.remove("sheet-open");
  if (state.liveMode) {
    ensureLiveDock();
    if (state.syncCode && state.viewing) bindLiveDock(state.syncCode.toUpperCase(), state.viewing);
    if (!state.liveDeck) renderLiveMini();
  }
}
overlay.onclick = (e) => { if (e.target === overlay) closeSheet(); };

function openMenu(id) {
  // in live/readonly: only open subject detail page
  if (state.readonly || state.liveMode) {
    state.deckIndex = sortedSubjects(state.day || {}).findIndex((s) => s.id === id);
    if (state.deckIndex < 0) state.deckIndex = 0;
    state.liveDeck = true;
    return renderSubjectDeck();
  }
  const s = state.day.subjects[id];
  const name = s?.name || "درس";
  const sessions = (state.sessions || []).filter((x) => x.subjectId === id && x.date === state.viewing && x.status === "finished").sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  const fmt = (ts) => ts ? dig(new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) : "—";
  const sessHtml = sessions.length
    ? `<div class="sess-list"><p style="color:#aaa;font-size:.78rem;margin:8px 0 4px">بازه‌های تایمر امروز</p>${sessions.map((x) => `<div class="sess-row"><span>${x.activity === "test" ? "تست" : "مطالعه/کلاس"}</span><span>${fmt(x.startTime)} تا ${fmt(x.endTime)}</span><span>${hm(x.duration || 0)}</span></div>`).join("")}</div>`
    : `<p style="color:#666;font-size:.78rem;margin:8px 0">هنوز بازه تایمری برای این درس ثبت نشده.</p>`;
  openSheet(`<h3>${escapeHtml(name)}</h3>${sessHtml}
    <div class="menu-grid">
      <div class="btn-grid-2">
        <button class="primary" data-a="tstudy">شروع تایمر مطالعه</button>
        <button class="primary" data-a="ttest">شروع تایمر تست</button>
      </div>
      <div class="btn-grid-2">
        <button class="ghost" data-a="study">افزودن زمان مطالعه</button>
        <button class="ghost" data-a="test">افزودن زمان تست</button>
      </div>
      <div class="btn-grid-4">
        <button class="ghost" data-a="c">درست</button>
        <button class="ghost" data-a="w">نادرست</button>
        <button class="ghost" data-a="b">بدون پاسخ</button>
        <button class="ghost" data-a="p">تمرین</button>
      </div>
      <button class="ghost btn-block" data-a="todo">کارها (Todo)</button>
      <button class="ghost btn-block" data-a="note">یادداشت</button>
      <button class="primary btn-block" data-a="detail">نمایش اطلاعات تک‌درس</button>
      <button class="ghost btn-block" data-a="topic">مبحث مطالعه‌شده</button>
      <button class="ghost btn-block" data-a="mastery">کیفیت یادگیری و تسلط</button>
      <button class="ghost btn-block" data-a="blockers">مشکلات و موانع (فیدبک)</button>
      <button class="danger btn-block" data-close>بستن</button>
    </div>`);
  sheet.onclick = (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
    if (a === "note") return openNotes(id);
    if (a === "todo") return openTodos(id);
    if (a === "tstudy") { closeSheet(); return startTimer(id, "study"); }
    if (a === "ttest") { closeSheet(); return startTimer(id, "test"); }
    if (a === "detail") {
      closeSheet();
      state.deckIndex = sortedSubjects(state.day).findIndex((x) => x.id === id);
      if (state.deckIndex < 0) state.deckIndex = 0;
      state.liveDeck = false;
      return renderSubjectDeck(true);
    }
    if (a === "topic") return openSubjectField(id, "topic", "مبحث مطالعه‌شده");
    if (a === "mastery") return openSubjectField(id, "masteryNote", "کیفیت یادگیری و تسلط");
    if (a === "blockers") return openSubjectField(id, "blockers", "مشکلات و موانع (فیدبک)");
    askAdd(id, a);
  };
}
function openSubjectField(id, field, title) {
  if (state.readonly) return;
  const s = state.day.subjects[id];
  if (!s) return;
  openSheet(`<h3>${escapeHtml(title)}</h3>
    <p class="hint">${escapeHtml(s.name || "")}</p>
    <div class="field"><textarea id="fld" rows="5" placeholder="بنویس…">${escapeHtml(s[field] || "")}</textarea></div>
    <button class="primary btn-block" id="ok">ذخیره</button>
    <button class="ghost btn-block" data-close>بستن</button>`);
  sheet.querySelector("#ok").onclick = async () => {
    s[field] = sheet.querySelector("#fld").value.trim();
    touchSubject(s);
    await saveDay();
    closeSheet();
    render();
  };
}
function openSubjectFieldView(id, field, title) {
  const s = state.day?.subjects?.[id];
  if (!s) return;
  const text = s[field] || "";
  openSheet(`<h3>${escapeHtml(title)}</h3>
    <p class="hint">${escapeHtml(s.name || "")}</p>
    <div class="field-view">${escapeHtml(text) || "—"}</div>
    ${state.readonly || state.liveMode ? "" : `<button class="ghost btn-block" id="edit">ویرایش</button>`}
    <button class="ghost btn-block" data-close>بستن</button>`);
  const ed = sheet.querySelector("#edit");
  if (ed) ed.onclick = () => openSubjectField(id, field, title);
}
function openTodos(id) {
  if (state.readonly) return;
  const s = state.day.subjects[id];
  if (!s) return;
  if (!Array.isArray(s.todos)) s.todos = [];
  const paint = () => {
    openSheet(`<h3>کارهای ${escapeHtml(s.name)}</h3>
      <div class="todo-list">${s.todos.length ? s.todos.map((t, i) => `
        <div class="todo-line ${t.done ? "is-done" : ""}" style="margin:6px 0">
          <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer">
            <input type="checkbox" data-ti="${i}" ${t.done ? "checked" : ""}>
            <span class="todo-text">${escapeHtml(t.text)}</span>
            ${t.range ? `<span class="todo-time">${escapeHtml(t.range)}</span>` : ""}
          </label>
          <button type="button" class="danger sm" data-td="${i}">حذف</button>
        </div>`).join("") : `<p class="hint">هنوز کاری نیست</p>`}
      </div>
      <div class="field"><label>عنوان</label><input id="tdt" placeholder="کار جدید…"></div>
      <div class="field"><label>بازه</label>
        <select id="trtype">
          <option value="none">بدون بازه</option>
          <option value="span">از ساعت تا ساعت</option>
          <option value="dur">مدت</option>
        </select>
      </div>
      <div class="field-row" id="trspan" style="display:none">
        <div class="field"><label>از</label><input id="tfrom" type="time" value="08:00"></div>
        <div class="field"><label>تا</label><input id="tto" type="time" value="10:00"></div>
      </div>
      <div class="field-row" id="trdur" style="display:none">
        <div class="field"><label>ساعت</label><input id="tdh" type="number" min="0" max="12" value="1"></div>
        <div class="field"><label>دقیقه</label><input id="tdm" type="number" min="0" max="59" value="0"></div>
      </div>
      <div class="btn-grid-2">
        <button class="primary" id="addT">افزودن</button>
        <button class="ghost" data-close>بستن</button>
      </div>`);
    const syncType = () => {
      const v = sheet.querySelector("#trtype").value;
      sheet.querySelector("#trspan").style.display = v === "span" ? "grid" : "none";
      sheet.querySelector("#trdur").style.display = v === "dur" ? "grid" : "none";
    };
    sheet.querySelector("#trtype").onchange = syncType;
    sheet.querySelector("#addT").onclick = async () => {
      const text = sheet.querySelector("#tdt").value.trim();
      if (!text) return;
      let range = "";
      const typ = sheet.querySelector("#trtype").value;
      if (typ === "span") {
        const a = sheet.querySelector("#tfrom").value;
        const b = sheet.querySelector("#tto").value;
        if (a && b) range = `${a}–${b}`;
      } else if (typ === "dur") {
        const h = Number(sheet.querySelector("#tdh").value) || 0;
        const m = Number(sheet.querySelector("#tdm").value) || 0;
        if (h || m) range = h && m ? `${h}س ${m}د` : h ? `${h} ساعت` : `${m} دقیقه`;
      }
      s.todos.push({ text, done: false, range, at: Date.now() });
      touchSubject(s); await saveDay(); paint(); render();
    };
    sheet.querySelectorAll("[data-ti]").forEach((c) => {
      c.onchange = async () => {
        const i = Number(c.dataset.ti);
        if (s.todos[i]) s.todos[i].done = c.checked;
        touchSubject(s); await saveDay(); paint(); render();
      };
    });
    sheet.querySelectorAll("[data-td]").forEach((b) => {
      b.onclick = async () => {
        s.todos.splice(Number(b.dataset.td), 1);
        touchSubject(s); await saveDay(); paint(); render();
      };
    });
    sheet.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => { closeSheet(); render(); });
  };
  paint();
}
function askAdd(id, kind) {
  const time = kind === "study" || kind === "test";
  openSheet(`<h3>افزودن</h3>${time ? `<div class="field"><label>ساعت</label><input id="hh" type="number" min="0" max="24" value="0"></div><div class="field"><label>دقیقه</label><input id="mm" type="number" min="0" max="59" value="0"></div>` : `<div class="field"><label>تعداد</label><input id="nn" type="number" min="0" value="1"></div>`}<button class="primary" id="ok">ثبت</button>`);
  sheet.querySelector("#ok").onclick = async () => {
    const s = state.day.subjects[id];
    if (time) {
      const hh = Number(sheet.querySelector("#hh").value) || 0, mm = Number(sheet.querySelector("#mm").value) || 0;
      if (mm > 59 || hh < 0) return alert("زمان نامعتبر است");
      const sec = hh * 3600 + mm * 60;
      if (kind === "study") s.studySec += sec; else s.testSec += sec;
    } else {
      const n = Number(sheet.querySelector("#nn").value) || 0; if (n < 0) return;
      if (kind === "c") s.correct += n; if (kind === "w") s.wrong += n; if (kind === "b") s.blank += n; if (kind === "p") s.practice = (s.practice || 0) + n;
    }
    touchSubject(s); await saveDay(); closeSheet(); render();
  };
}
function editTime(id, field) {
  const s = state.day.subjects[id];
  const raw = Math.max(0, Math.round(Number(s[field] || 0)));
  const hh = Math.floor(raw / 3600), mm = Math.floor((raw % 3600) / 60);
  openSheet(`<h3>اصلاح</h3><div class="field"><label>ساعت</label><input id="hh" type="number" value="${hh}"></div><div class="field"><label>دقیقه</label><input id="mm" type="number" value="${mm}"></div><button class="primary" id="ok">ذخیره</button>`);
  sheet.querySelector("#ok").onclick = async () => {
    s[field] = (Number(sheet.querySelector("#hh").value) || 0) * 3600 + (Number(sheet.querySelector("#mm").value) || 0) * 60;
    touchSubject(s); await saveDay(); closeSheet(); render();
  };
}
async function startTimer(subjectId, activity) {
  if (state.timer && state.timer.status !== "finished") {
    if (state.timer.subjectId === subjectId && state.timer.activity === activity) {
      if (state.timer.status === "paused") state.timer = resumeTimer(state.timer);
      await saveTimer();
      render();
      renderMini();
      return;
    }
    if (!confirm("تایمر فعلی متوقف و تایمر جدید شروع شود؟")) return;
    await finishActive();
  }
  state.timer = createTimer({ subjectId, activity, date: state.viewing });
  await db.kvSet("activeTimer", state.timer);
  scheduleLivePush(true);
  schedulePush();
  render();
  renderMini();
  // only mini timer — fullscreen only via button
}
async function finishActive() {
  if (!state.timer || state.timer.persisted) return;
  // close mini panel immediately on finish
  miniEl.classList.remove("show", "live-viewer");
  miniEl.innerHTML = "";
  miniEl.style.display = "";
  state.timer.persisted = true; state.timer = finishTimer(state.timer);
  const sec = Math.round(elapsedMs(state.timer, state.timer.finishedAt) / 1000);
  const day = await db.get("days", state.timer.date);
  if (day?.subjects[state.timer.subjectId] && sec > 0) {
    const s = day.subjects[state.timer.subjectId];
    if (state.timer.activity === "test") s.testSec += sec; else s.studySec += sec;
    s.updatedAt = Date.now();
    const list = Object.values(day.subjects).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).filter((x) => x.id !== s.id);
    s.order = 0; list.forEach((x, i) => { x.order = i + 1; });
    await db.put("days", day);
    if (day.date === state.viewing) state.day = day;
  }
  const sess = { id: state.timer.id, subjectId: state.timer.subjectId, activity: state.timer.activity, date: state.timer.date, startTime: state.timer.segments[0]?.start, endTime: state.timer.finishedAt, duration: sec, status: "finished" };
  await db.put("sessions", sess);
  state.sessions.push(sess);
  state.timer = null;
  await saveTimer();
  // triple-sure: push off again after state is null
  if (state.syncCode && sync.hasConfig(state.firebase) && navigator.onLine && sync.pushLiveTimer) {
    try {
      await sync.initSync(state.firebase);
      await sync.pushLiveTimer((state.syncCode || "").toUpperCase(), state.viewing || state.today, null);
    } catch {}
  }
  focusEl.classList.remove("open");
  document.body.classList.remove("focus-open");
  render();
}
function onMini(e) {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act || !state.timer) return;
  if (act === "pause") { state.timer = state.timer.status === "paused" ? resumeTimer(state.timer) : pauseTimer(state.timer); saveTimer().then(render); }
  if (act === "finish") finishActive();
  if (act === "full") openFocus();
  if (act === "aot") openAlwaysOnDisplay();
}
function armFocusChrome() {
  clearTimeout(state.focusChromeTimer);
  if (!state.focusImmersive) return;
  const bar = focusEl.querySelector(".focus-chrome");
  const ui = focusEl.querySelector(".focus-ui");
  if (bar) bar.classList.remove("faded");
  if (ui) ui.classList.remove("chrome-hidden");
  state.focusChromeTimer = setTimeout(() => {
    const b = focusEl.querySelector(".focus-chrome");
    const u = focusEl.querySelector(".focus-ui");
    if (b && state.focusImmersive) b.classList.add("faded");
    if (u && state.focusImmersive) u.classList.add("chrome-hidden");
  }, 5000);
}

async function openAlwaysOnDisplay() {
  if (!state.timer) {
    alert("ابتدا یک تایمر را شروع کنید");
    return;
  }
  const sub = state.catalog.find((s) => s.id === state.timer.subjectId) || state.day?.subjects?.[state.timer.subjectId];
  const name = sub?.name || "تایمر";
  const act = state.timer.activity === "test" ? "تست" : "مطالعه";
  const paintPip = (doc, root) => {
    const clock = formatHMS(elapsedMs(state.timer));
    root.innerHTML = `<div style="font-family:Tahoma,sans-serif;background:#090B10;color:#F5F6F8;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0;padding:12px;box-sizing:border-box">
      <div style="font-size:12px;color:#A5ADBA;margin-bottom:6px">${name} · ${act}</div>
      <div id="pip-clock" style="font-size:36px;font-weight:700;letter-spacing:.04em;color:#FFC94A;font-variant-numeric:tabular-nums">${clock}</div>
      <div style="font-size:11px;color:#737D8D;margin-top:8px">شناور (Always on top در حد مرورگر)</div>
    </div>`;
  };
  try {
    if (window.documentPictureInPicture) {
      const pipWin = await documentPictureInPicture.requestWindow({ width: 360, height: 170 });
      const style = pipWin.document.createElement("style");
      style.textContent = "html,body{margin:0;height:100%;background:#090B10;overflow:hidden}";
      pipWin.document.head.appendChild(style);
      const root = pipWin.document.createElement("div");
      root.style.height = "100%";
      pipWin.document.body.appendChild(root);
      paintPip(pipWin.document, root);
      const iv = setInterval(() => {
        if (!state.timer || state.timer.status === "finished") { clearInterval(iv); try { pipWin.close(); } catch {} return; }
        const el = pipWin.document.getElementById("pip-clock");
        if (el) el.textContent = formatHMS(elapsedMs(state.timer));
      }, 250);
      pipWin.addEventListener("pagehide", () => clearInterval(iv));
      return;
    }
  } catch (e) { console.warn("PiP failed", e); }
  const pop = window.open("", "study-timer-float", "width=360,height=170,menubar=no,toolbar=no,location=no,status=no");
  if (!pop) {
    alert("پنجره شناور مسدود شد.\\nدر کروم دسکتاپ اجازه پاپ‌آپ بده یا از Document PiP استفاده کن.\\nAlways-on-top واقعی ویندوز نیاز به Electron دارد.");
    return;
  }
  pop.document.title = "تایمر مطالعه";
  const root = pop.document.createElement("div");
  root.style.height = "100%";
  pop.document.body.style.margin = "0";
  pop.document.body.appendChild(root);
  paintPip(pop.document, root);
  const iv = setInterval(() => {
    if (pop.closed || !state.timer || state.timer.status === "finished") { clearInterval(iv); try { pop.close(); } catch {} return; }
    const el = pop.document.getElementById("pip-clock");
    if (el) el.textContent = formatHMS(elapsedMs(state.timer));
  }, 250);
}

function openFocus() {
  if (!state.timer) return;
  state.focusImmersive = false;
  // hide mini + dock while fullscreen
  miniEl.classList.remove("show");
  miniEl.innerHTML = "";
  document.body.classList.add("focus-open");
  const sub = state.catalog.find((s) => s.id === state.timer.subjectId) || state.day?.subjects?.[state.timer.subjectId];
  focusEl.classList.add("open");
  focusEl.style.backgroundImage = state.focusUrl && !state.focusVideo ? `url(${state.focusUrl})` : "none";
  const paint = () => {
    if (!state.timer) return;
    const paused = state.timer.status === "paused";
    const imm = state.focusImmersive;
    const font = state.settings.timerFont || "system";
    const actLabel = state.timer.activity === "test" ? "تست" : "مطالعه / کلاس";
    focusEl.innerHTML = `${state.focusVideo ? `<video src="${state.focusVideo}" autoplay muted loop playsinline></video>` : ""}
      <div class="dim" style="background:#000;opacity:${state.settings.focusOverlay ?? state.settings.overlay ?? 0.45}"></div>
      <div class="ui focus-ui ${imm ? "immersive" : ""}">
        <div class="focus-name">${escapeHtml(sub?.name || "")}</div>
        <div class="focus-act">${actLabel}</div>
        <div class="clock timer-font-${font}">${formatHMS(elapsedMs(state.timer))}</div>
        <div class="focus-chrome ${imm ? "is-immersive" : ""}">
          <div class="cwb cwb-sm">
            <button type="button" class="cwb-btn ok" id="fc" title="درست">درست</button>
            <button type="button" class="cwb-btn bad" id="fw" title="نادرست">نادرست</button>
            <button type="button" class="cwb-btn blank" id="fb" title="بدون پاسخ">بدون پاسخ</button>
            <button type="button" class="cwb-btn practice" id="fpra" title="تمرین">تمرین</button>
          </div>
          <div class="focus-main-actions">
            <button class="ghost" id="fp">${paused ? "ادامه" : "مکث"}</button>
            ${imm ? "" : `<button class="ghost" id="fs">تمام‌صفحه</button>`}
            <button class="primary" id="ff">پایان</button>
          </div>
          <button class="danger focus-exit" id="fe">خروج</button>
          <button class="ghost focus-aot" id="faot" title="شناور">↑</button>
        </div>
      </div>`;
    focusEl.querySelector("#fc").onclick = (e) => { e.stopPropagation(); bumpTest("correct"); armFocusChrome(); };
    focusEl.querySelector("#fw").onclick = (e) => { e.stopPropagation(); bumpTest("wrong"); armFocusChrome(); };
    focusEl.querySelector("#fb").onclick = (e) => { e.stopPropagation(); bumpTest("blank"); armFocusChrome(); };
    const pra = focusEl.querySelector("#fpra");
    if (pra) pra.onclick = async (e) => {
      e.stopPropagation();
      if (!state.timer || !state.day?.subjects?.[state.timer.subjectId]) return;
      const s = state.day.subjects[state.timer.subjectId];
      s.practice = (s.practice || 0) + 1;
      touchSubject(s);
      await saveDay();
      armFocusChrome();
    };
    focusEl.querySelector("#fp").onclick = async (e) => {
      e.stopPropagation();
      state.timer = state.timer.status === "paused" ? resumeTimer(state.timer) : pauseTimer(state.timer);
      await saveTimer(); scheduleLivePush(); paint(); armFocusChrome();
    };
    focusEl.querySelector("#ff").onclick = async (e) => {
      e.stopPropagation();
      focusEl.classList.remove("open"); state.focusImmersive = false;
      document.body.classList.remove("focus-open");
      document.exitFullscreen?.();
      await finishActive();
      renderMini();
    };
    focusEl.querySelector("#fe").onclick = (e) => {
      e.stopPropagation();
      focusEl.classList.remove("open"); state.focusImmersive = false;
      document.body.classList.remove("focus-open");
      clearTimeout(state.focusChromeTimer);
      document.exitFullscreen?.();
      render();
      renderMini();
    };
    const fsBtn = focusEl.querySelector("#fs");
    if (fsBtn) fsBtn.onclick = (e) => {
      e.stopPropagation();
      state.focusImmersive = true;
      paint();
      armFocusChrome();
      focusEl.requestFullscreen?.().catch(() => {});
    };
    const aotBtn = focusEl.querySelector("#faot");
    if (aotBtn) aotBtn.onclick = (e) => { e.stopPropagation(); openAlwaysOnDisplay(); };
    if (imm) armFocusChrome();
  };
  paint();
  focusEl.querySelectorAll("video").forEach(setupSeamlessVideo);
  const tick = setInterval(() => {
    if (!focusEl.classList.contains("open") || !state.timer) { clearInterval(tick); return; }
    const c = focusEl.querySelector(".clock");
    if (c) c.textContent = formatHMS(elapsedMs(state.timer));
    focusEl.querySelectorAll("video").forEach(setupSeamlessVideo);
  }, 250);
  focusEl.onclick = (e) => {
    if (!state.focusImmersive) return;
    if (e.target.closest("button")) return;
    // single tap: toggle chrome visibility
    const bar = focusEl.querySelector(".focus-chrome");
    if (!bar) return;
    const ui = focusEl.querySelector(".focus-ui");
    if (bar.classList.contains("faded")) {
      armFocusChrome();
    } else {
      clearTimeout(state.focusChromeTimer);
      bar.classList.add("faded");
      if (ui) ui.classList.add("chrome-hidden");
    }
  };
  focusEl.ondblclick = (e) => {
    if (e.target.closest("button")) return;
    if (state.focusImmersive) {
      state.focusImmersive = false;
      clearTimeout(state.focusChromeTimer);
      document.exitFullscreen?.();
      paint();
    } else {
      state.focusImmersive = true;
      paint();
      armFocusChrome();
      focusEl.requestFullscreen?.().catch(() => {});
      return;
    }
  };
}
async function bumpTest(kind) {
  if (!state.timer || !state.day?.subjects?.[state.timer.subjectId]) return;
  const s = state.day.subjects[state.timer.subjectId];
  s[kind] = (s[kind] || 0) + 1;
  touchSubject(s);
  await saveDay();
}
function openRecover() {
  openSheet(`<h3>جلسه ناتمام</h3><div class="row-actions"><button class="primary" id="rc">ادامه</button><button class="ghost" id="rf">پایان</button><button class="danger" id="rd">حذف</button></div>`);
  sheet.querySelector("#rc").onclick = async () => { if (state.timer.status === "paused") state.timer = resumeTimer(state.timer); await saveTimer(); closeSheet(); render(); };
  sheet.querySelector("#rf").onclick = async () => { closeSheet(); await finishActive(); };
  sheet.querySelector("#rd").onclick = async () => { if (!confirm("حذف شود؟")) return; state.timer = null; await saveTimer(); closeSheet(); render(); };
}
async function resetDay() {
  if (!confirm("همه اطلاعات همین روز پاک شود؟")) return;
  const date = state.day.date, target = state.day.targetSec;
  state.day = { date, targetSec: target, sleep: null, subjects: {}, updatedAt: Date.now() };
  state.catalog.filter((s) => s.active !== false).forEach((s, i) => { state.day.subjects[s.id] = snap(s, i); });
  await saveDay(); render();
}
function openManage() {
  const rows = state.catalog.filter((s) => s.active !== false).map((s) => `<div class="field"><label>${s.name}</label><input data-id="${s.id}" data-k="name" value="${s.name}"><input data-id="${s.id}" data-k="color" value="${s.color}" placeholder="#00A693"><input data-id="${s.id}" data-k="target" value="${Math.floor((s.targetSec || 0) / 3600)}:${String(Math.floor(((s.targetSec || 0) % 3600) / 60)).padStart(2, "0")}"><button class="danger" data-del="${s.id}">حذف</button></div>`).join("");
  openSheet(`<h3>مدیریت</h3>
    <div class="field"><label>هدف روزانه ساعت:دقیقه</label><input id="dt" value="${Math.floor(state.settings.dailyTargetSec / 3600)}:${String(Math.floor((state.settings.dailyTargetSec % 3600) / 60)).padStart(2, "0")}"></div>
    <div class="field"><label>زبان اعداد</label><select id="digits"><option value="en" ${state.settings.digits !== "fa" ? "selected" : ""}>English 1 2 3</option><option value="fa" ${state.settings.digits === "fa" ? "selected" : ""}>فارسی ۰ ۱ ۲</option></select></div>
    <div class="field"><label>فونت تایمر</label><select id="tfont">
      <option value="system" ${state.settings.timerFont==="system"||!state.settings.timerFont?"selected":""}>سیستم</option>
      <option value="mono" ${state.settings.timerFont==="mono"?"selected":""}>دیجیتال</option>
      <option value="rounded" ${state.settings.timerFont==="rounded"?"selected":""}>گرد</option>
      <option value="vazir" ${state.settings.timerFont==="vazir"?"selected":""}>وزیر</option>
      <option value="custom" ${state.settings.timerFont==="custom"?"selected":""}>سفارشی</option>
    </select></div>
    <div class="field"><label>فونت برنامه</label><select id="afont">
      <option value="system" ${state.settings.appFont==="system"||!state.settings.appFont?"selected":""}>سیستم</option>
      <option value="vazir" ${state.settings.appFont==="vazir"?"selected":""}>وزیر</option>
      <option value="rounded" ${state.settings.appFont==="rounded"?"selected":""}>گرد</option>
      <option value="mono" ${state.settings.appFont==="mono"?"selected":""}>مونو</option>
      <option value="custom" ${state.settings.appFont==="custom"?"selected":""}>سفارشی</option>
    </select></div>
    <div class="btn-grid-2">
      <button class="ghost" id="upTFont">آپلود فونت تایمر</button>
      <button class="ghost" id="upAFont">آپلود فونت برنامه</button>
    </div>
    <input id="tfontf" type="file" accept=".woff2,.woff,.ttf,.otf" hidden>
    <input id="afontf" type="file" accept=".woff2,.woff,.ttf,.otf" hidden>
    <div class="field-row sleep-manage-row">
      <div class="field"><label>خواب</label><input id="bed" placeholder="23:45" value="${state.day.sleep?.bed || ""}"></div>
      <div class="field"><label>بیداری</label><input id="wake" placeholder="07:15" value="${state.day.sleep?.wake || ""}"></div>
      <div class="field"><label>تایم شروع درس</label><input id="studyStart" placeholder="08:30" value="${state.day.studyStart || ""}"></div>
    </div>
    <p style="color:#aaa;font-size:.75rem">رنگ را با کد مثل #00A693 عوض کن. پس‌زمینه پنل می‌تواند عکس یا فیلم تکرارشونده باشد.</p>
    ${rows}
    <div class="field"><label>درس جدید</label><input id="nn"></div>
    <div class="field"><label>کدورت زمینه پنل (۰–۱)</label><input id="pop" type="number" min="0" max="1" step="0.05" value="${state.settings.panelBgOpacity ?? 0.28}"></div>
    <div class="field"><label>کدورت لایه تمرکز</label><input id="fop" type="number" min="0" max="1" step="0.05" value="${state.settings.focusOverlay ?? 0.45}"></div>
    <hr style="border-color:rgba(255,255,255,.1)">
    <p style="color:#aaa;font-size:.75rem">همگام‌سازی چند دستگاه + لینک زنده مشاور (Firebase)</p>
    <div class="field"><label>کد همگام‌سازی</label><input id="scode" value="${state.syncCode || ""}" placeholder="مثلاً AB12CD34"></div>
    <div class="row-actions"><button class="ghost" id="genCode">ساخت کد جدید</button><button class="ghost" id="pullSync">دریافت از ابر</button></div>
    <div class="field"><label>Firebase apiKey</label><input id="fb_key" value="${state.firebase?.apiKey || ""}"></div>
    <div class="field"><label>projectId</label><input id="fb_pid" value="${state.firebase?.projectId || ""}"></div>
    <div class="field"><label>databaseURL</label><input id="fb_url" value="${state.firebase?.databaseURL || ""}" placeholder="https://….firebaseio.com"></div>
    <hr style="border-color:rgba(255,255,255,.1)">
    <div class="ripple-row">
      <label class="rip-lab"><input type="checkbox" id="rip" ${state.settings.ripple !== false ? "checked" : ""}> هاله لمس</label>
      <label class="rip-lab">رنگ <input id="ripcol" type="color" value="${state.settings.rippleColor || "#E6A817"}"></label>
    </div>
    <hr style="border-color:rgba(255,255,255,.1)">
    <p class="hint">پس‌زمینه تمرکز</p>
    <div class="btn-grid-2">
      <button class="ghost" id="fimg">تصویر تمرکز</button>
      <button class="ghost" id="fvid">ویدیو تمرکز</button>
      <button class="danger sm" id="fclr">حذف تمرکز</button>
    </div>
    <p class="hint">پس‌زمینه پنل</p>
    <div class="btn-grid-2">
      <button class="ghost" id="pimg">عکس پنل</button>
      <button class="ghost" id="pvid">فیلم پنل</button>
      <button class="danger sm" id="pclr">حذف پنل</button>
    </div>
    <div class="btn-grid-2" style="margin-top:10px">
      <button class="primary" id="save">ذخیره</button>
      <button class="ghost" id="add">افزودن درس</button>
    </div>
    <button class="ghost btn-block" id="install" style="margin-top:8px">نصب روی گوشی</button>
    <div class="btn-grid-2" style="margin-top:12px">
      <button class="ghost" id="bakOut">دانلود بک‌آپ</button>
      <button class="ghost" id="bakIn">آپلود بک‌آپ</button>
    </div>
    <button class="danger btn-block" data-close style="margin-top:12px">بستن</button>
    <input id="bakFile" type="file" accept="application/json,.json" hidden>
    <input id="pimgf" type="file" accept="image/*" hidden>
    <input id="pvidf" type="file" accept="video/*" hidden>
    <input id="ifile" type="file" accept="image/*" hidden>
    <input id="vfile" type="file" accept="video/*" hidden>
    <input id="icofile" type="file" accept="image/*" hidden>`);
  sheet.querySelector("#pimg").onclick = () => sheet.querySelector("#pimgf").click();
  sheet.querySelector("#pvid").onclick = () => sheet.querySelector("#pvidf").click();
  sheet.querySelector("#fimg").onclick = () => sheet.querySelector("#ifile").click();
  sheet.querySelector("#fvid").onclick = () => sheet.querySelector("#vfile").click();
  sheet.querySelector("#pimgf").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    await db.blobSet("panelBg", f); state.panelBgType = "image"; await db.kvSet("panelBgType", "image");
    if (state.panelBg) URL.revokeObjectURL(state.panelBg);
    state.panelBg = URL.createObjectURL(f); render();
  };
  sheet.querySelector("#pvidf").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    await db.blobSet("panelBg", f); state.panelBgType = "video"; await db.kvSet("panelBgType", "video");
    if (state.panelBg) URL.revokeObjectURL(state.panelBg);
    state.panelBg = URL.createObjectURL(f); render();
  };
  sheet.querySelector("#ifile").onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; await db.blobSet("focusImage", f); state.focusUrl = URL.createObjectURL(f); };
  sheet.querySelector("#vfile").onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; await db.blobSet("focusVideo", f); state.focusVideo = URL.createObjectURL(f); };
  const pclr = sheet.querySelector("#pclr");
  if (pclr) pclr.onclick = async () => {
    try { await db.blobSet("panelBg", new Blob()); } catch {}
    await db.kvSet("panelBgType", "");
    if (state.panelBg) URL.revokeObjectURL(state.panelBg);
    state.panelBg = ""; state.panelBgType = "";
    closeSheet(); render();
  };
  const fclr = sheet.querySelector("#fclr");
  if (fclr) fclr.onclick = async () => {
    try { await db.blobSet("focusImage", new Blob()); await db.blobSet("focusVideo", new Blob()); } catch {}
    if (state.focusUrl) URL.revokeObjectURL(state.focusUrl);
    if (state.focusVideo) URL.revokeObjectURL(state.focusVideo);
    state.focusUrl = ""; state.focusVideo = "";
    alert("پس‌زمینه تمرکز حذف شد");
  };

  
  const upT = sheet.querySelector("#upTFont");
  const upA = sheet.querySelector("#upAFont");
  if (upT) upT.onclick = () => sheet.querySelector("#tfontf").click();
  if (upA) upA.onclick = () => sheet.querySelector("#afontf").click();
  const loadFont = async (file, key, cssVar) => {
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf], { type: file.type || "font/ttf" });
    await db.blobSet(key, blob);
    const url = URL.createObjectURL(blob);
    const face = new FontFace(cssVar, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    return url;
  };
  sheet.querySelector("#tfontf").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    await loadFont(f, "fontTimer", "TimerCustom");
    state.settings.timerFont = "custom";
    await db.kvSet("settings", state.settings);
    applyFonts();
    alert("فونت تایمر اضافه شد");
  };
  sheet.querySelector("#afontf").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    await loadFont(f, "fontApp", "AppCustom");
    state.settings.appFont = "custom";
    await db.kvSet("settings", state.settings);
    applyFonts();
    alert("فونت برنامه اضافه شد");
  };
sheet.querySelector("#add").onclick = async () => {
    const name = sheet.querySelector("#nn").value.trim(); if (!name) return;
    const sub = { id: uid("sub"), name, color: GOLD, targetSec: 7200, active: true, createdAt: Date.now(), updatedAt: Date.now() };
    state.catalog.push(sub); await db.put("subjects", sub);
    state.day.subjects[sub.id] = snap(sub, 0); touchSubject(state.day.subjects[sub.id]);
    await saveDay(); openManage(); render();
  };
  sheet.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("حذف شود؟")) return;
    const sub = state.catalog.find((s) => s.id === b.dataset.del); sub.active = false; await db.put("subjects", sub);
    if (state.day.subjects[sub.id] && !totalOf(state.day.subjects[sub.id])) delete state.day.subjects[sub.id];
    await saveDay(); openManage(); render();
  });
  const inst = sheet.querySelector("#install"); if (inst) inst.onclick = () => promptInstall();
  sheet.querySelector("#genCode").onclick = () => { sheet.querySelector("#scode").value = sync.genSyncCode(); };
  sheet.querySelector("#bakOut").onclick = async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `study-backup-${state.today}.json`;
    a.click();
  };
  sheet.querySelector("#bakIn").onclick = () => sheet.querySelector("#bakFile").click();
  sheet.querySelector("#bakFile").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!confirm("همه داده‌های فعلی با بک‌آپ جایگزین شود؟")) return;
      await db.importAll(data);
      location.reload();
    } catch (err) { alert("بک‌آپ نامعتبر: " + err.message); }
  };
  sheet.querySelector("#pullSync").onclick = async () => {
    const code = sheet.querySelector("#scode").value.trim().toUpperCase();
    const fb = {
      apiKey: sheet.querySelector("#fb_key").value.trim(),
      projectId: sheet.querySelector("#fb_pid").value.trim(),
      databaseURL: sheet.querySelector("#fb_url").value.trim()
    };
    if (!code || !sync.hasConfig(fb)) return alert("کد و تنظیمات Firebase را کامل کن");
    await sync.initSync(fb);
    const bundle = await sync.pullBundle(code);
    if (!bundle) return alert("چیزی در ابر پیدا نشد");
    if (!confirm("داده ابری جایگزین/ادغام شود؟")) return;
    await onRemoteBundle(bundle);
    alert("دریافت شد");
  };
  sheet.querySelector("#save").onclick = async () => {
    const [h, m] = sheet.querySelector("#dt").value.split(":").map(Number);
    state.settings.dailyTargetSec = (h || 0) * 3600 + (m || 0) * 60;
    state.settings.digits = sheet.querySelector("#digits").value;
    state.settings.panelBgOpacity = Math.max(0, Math.min(1, Number(sheet.querySelector("#pop").value) || 0.28));
    state.settings.focusOverlay = Math.max(0, Math.min(1, Number(sheet.querySelector("#fop").value) || 0.45));
    state.settings.overlay = state.settings.focusOverlay;
    state.settings.ripple = sheet.querySelector("#rip")?.checked !== false;
    state.settings.rippleColor = sheet.querySelector("#ripcol")?.value || "#E6A817";
    state.settings.timerFont = sheet.querySelector("#tfont")?.value || "system";
    state.settings.appFont = sheet.querySelector("#afont")?.value || "system";
    await db.kvSet("settings", state.settings);
    document.documentElement.style.setProperty("--ripple", state.settings.rippleColor);
    applyFonts();
    state.syncCode = sheet.querySelector("#scode").value.trim().toUpperCase();
    await db.kvSet("syncCode", state.syncCode);
    state.firebase = {
      apiKey: sheet.querySelector("#fb_key").value.trim(),
      projectId: sheet.querySelector("#fb_pid").value.trim(),
      databaseURL: sheet.querySelector("#fb_url").value.trim()
    };
    await db.kvSet("firebase", state.firebase);
    if (sync.hasConfig(state.firebase)) {
      await sync.initSync(state.firebase);
      if (state.syncCode) {
        await sync.subscribeBundle(state.syncCode, onRemoteBundle);
        schedulePush();
      }
    }

    state.day.targetSec = state.settings.dailyTargetSec;
    const bed = sheet.querySelector("#bed").value.trim(), wake = sheet.querySelector("#wake").value.trim();
    if (bed && wake) state.day.sleep = { bed, wake };
    else if (!bed && !wake) state.day.sleep = null;
    const studyStart = sheet.querySelector("#studyStart")?.value.trim() || "";
    state.day.studyStart = studyStart || null;
    sheet.querySelectorAll("[data-id]").forEach((input) => {
      const sub = state.catalog.find((s) => s.id === input.dataset.id); if (!sub) return;
      if (input.dataset.k === "name" && input.value.trim()) sub.name = input.value.trim();
      if (input.dataset.k === "color" && hexOk(input.value.trim())) sub.color = input.value.trim();
      if (input.dataset.k === "target") { const [hh, mm] = input.value.split(":").map(Number); sub.targetSec = (hh || 0) * 3600 + (mm || 0) * 60; }
    });
    for (const sub of state.catalog) await db.put("subjects", sub);
    if (state.viewing === state.today) state.catalog.filter((s) => s.active !== false).forEach((s) => {
      if (state.day.subjects[s.id]) { state.day.subjects[s.id].name = s.name; state.day.subjects[s.id].color = s.color; state.day.subjects[s.id].targetSec = s.targetSec; }
    });
    await saveDay(); closeSheet(); render();
  };
}
async function go(date) { await ensure(date); state.viewing = date; state.day = await db.get("days", date); closeSheet(); render(); }
function historyYearOptions(selectedY) {
  const y = Number(selectedY) || parseKey(state.today || todayKey()).jy;
  // current year ± 3
  const years = [];
  for (let i = y - 3; i <= y + 1; i++) years.push(i);
  return years.map((yy) => `<option value="${yy}" ${yy === y ? "selected" : ""}>${dig(yy)}</option>`).join("");
}
function openHistory(year) {
  const { jy: todayY } = parseKey(state.today || state.viewing || todayKey());
  const jy = year != null ? Number(year) : todayY;
  openSheet(`<h3>تاریخچه</h3>
    <div class="field"><label>سال</label>
      <select id="histYear">${historyYearOptions(jy)}</select>
    </div>
    <div class="row-actions" style="flex-wrap:wrap;margin-top:10px">${MONTHS.map((m, i) => `<button class="ghost" data-m="${i + 1}">${m}</button>`).join("")}</div>
    <button class="ghost btn-block" data-close>بستن</button>`);
  sheet.querySelector("#histYear").onchange = (e) => openHistory(Number(e.target.value));
  sheet.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => openMonth(jy, Number(b.dataset.m)));
}
function openHistoryLive(year) {
  const { jy: defY } = parseKey(state.viewing || state.today || todayKey());
  if (!(state.days || []).length) {
    openSheet(`<h3>تاریخچه</h3><p class="hint">هنوز داده‌ای از دانش‌آموز نرسیده.</p><button class="ghost btn-block" data-close>بستن</button>`);
    return;
  }
  const jy = year != null ? Number(year) : defY;
  openSheet(`<h3>تاریخچه</h3>
    <p class="hint">فقط‌خواندنی</p>
    <div class="field"><label>سال</label>
      <select id="histYear">${historyYearOptions(jy)}</select>
    </div>
    <div class="row-actions" style="flex-wrap:wrap;margin-top:10px">${MONTHS.map((m, i) => `<button class="ghost" data-m="${i + 1}">${m}</button>`).join("")}</div>
    <button class="ghost btn-block" data-close>بستن</button>`);
  sheet.querySelector("#histYear").onchange = (e) => openHistoryLive(Number(e.target.value));
  sheet.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => openMonthLive(jy, Number(b.dataset.m)));
}
function openMonthLive(year, month) {
  const map = Object.fromEntries((state.days || []).map((d) => [d.date, d]));
  let html = "";
  for (let d = 1; d <= daysInJalaliMonth(year, month); d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const rec = map[key]; const sum = rec ? dayTotal(rec) : 0;
    html += `<button class="ghost" data-date="${key}" style="width:100%;margin:4px 0;opacity:${sum ? 1 : .45}">${dig(d)} ${MONTHS[month - 1]} ${sum ? hm(sum) : ""}</button>`;
  }
  openSheet(`<h3>${MONTHS[month - 1]}</h3>${html}
    <button class="ghost" id="back">ماه‌ها</button>
    <button class="ghost" data-close>بستن</button>`);
  sheet.querySelector("#back").onclick = () => openHistoryLive(year);
  sheet.querySelectorAll("[data-date]").forEach((b) => b.onclick = () => {
    const rec = (state.days || []).find((d) => d.date === b.dataset.date);
    if (!rec) return alert("برای این روز داده‌ای نیست");
    state.day = rec;
    state.viewing = rec.date;
    closeSheet();
    render();
    renderLiveMini();
  });
}
async function openMonth(year, month) {
  const map = Object.fromEntries((await db.all("days")).map((d) => [d.date, d]));
  let html = "";
  for (let d = 1; d <= daysInJalaliMonth(year, month); d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const rec = map[key]; const sum = rec ? dayTotal(rec) : 0;
    html += `<button class="ghost" data-date="${key}" style="width:100%;margin:4px 0;opacity:${sum ? 1 : .45}">${dig(d)} ${MONTHS[month - 1]} ${sum ? hm(sum) : ""}</button>`;
  }
  openSheet(`<h3>${MONTHS[month - 1]} ${dig(year)}</h3>${html}<button class="ghost" id="back">ماه‌ها</button>`);
  sheet.querySelector("#back").onclick = () => openHistory(year);
  sheet.querySelectorAll("[data-date]").forEach((b) => b.onclick = () => go(b.dataset.date));
}
async function openStats() {
  const today = state.today || todayKey();
  const yday = shiftKey(today, -1);
  const { jy: curY, jm: curM } = parseKey(today);
  const allDays = (state.liveMode ? (state.days || []) : await db.all("days")).slice().sort((a, b) => compareKeys(a.date, b.date));
  const dayOpts = allDays.map((d) => `<option value="${d.date}">${formatShort(d.date)}</option>`).join("");
  const weekOpts = Array.from({ length: 52 }, (_, i) => {
    const label = i === 0 ? "این هفته" : i === 1 ? "هفته قبل" : `${dig(i)} هفته قبل`;
    return `<option value="${i}">${label}</option>`;
  }).join("");
  const yearOpts = historyYearOptions(curY);
  openSheet(`<h3>آمار و مقایسه</h3>

    <div class="stats-section">
      <h4>مقایسه هفته‌ها</h4>
      <div class="week-cmp-line">
        <span class="day-cmp-lab">هفته ۱</span>
        <select id="wOffA">${weekOpts.replace('value="0"', 'value="0" selected')}</select>
        <button type="button" class="ghost sm" data-wq="0,1">این هفته</button>
      </div>
      <div class="week-cmp-line">
        <span class="day-cmp-lab">هفته ۲</span>
        <select id="wOffB">${weekOpts.replace('value="1"', 'value="1" selected')}</select>
        <button type="button" class="ghost sm" data-wq="1,0">هفته قبل</button>
      </div>
      <div id="weekCmpBox" class="week-box"></div>
    </div>

    <div class="stats-section">
      <h4>مقایسه روزها</h4>
      <div class="day-cmp-line">
        <span class="day-cmp-lab">روز ۱</span>
        <div class="ymd-row">
          <select id="daY" title="سال">${yearOpts}</select>
          <select id="daM" title="ماه">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === curM ? "selected" : ""}>${m}</option>`).join("")}</select>
          <select id="daD" title="روز"></select>
        </div>
        <button type="button" class="ghost sm" data-dq="today">امروز</button>
      </div>
      <div class="day-cmp-line">
        <span class="day-cmp-lab">روز ۲</span>
        <div class="ymd-row">
          <select id="dbY" title="سال">${yearOpts}</select>
          <select id="dbM" title="ماه">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === curM ? "selected" : ""}>${m}</option>`).join("")}</select>
          <select id="dbD" title="روز"></select>
        </div>
        <button type="button" class="ghost sm" data-dq="yday">دیروز</button>
      </div>
      <div id="cmpBox" class="week-box"></div>
    </div>

    <div class="stats-section">
      <h4>نمودار ماهانه</h4>
      <div class="field-row">
        <div class="field"><label>سال</label>
          <select id="my">${yearOpts}</select>
        </div>
        <div class="field"><label>ماه</label>
          <select id="ms">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === curM ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
      </div>
      <div class="row-actions chart-tabs">
        <button class="ghost" data-tab="study">مطالعه</button>
        <button class="ghost" data-tab="test">تست</button>
        <button class="ghost" data-tab="sleep">خواب</button>
      </div>
      <p class="hint">دابل‌کلیک روی نمودار = تمام‌صفحه · دابل‌کلیک دوباره = خروج · دکمه‌های ＋/－ برای زوم</p>
      <div id="chart" class="chart-host"></div>
      <div class="chart-tools">
        <button type="button" class="ghost sm" id="zIn">زوم ＋</button>
        <button type="button" class="ghost sm" id="zOut">زوم －</button>
        <button type="button" class="ghost sm" id="zFs">تمام‌صفحه</button>
      </div>
    </div>
    <button class="ghost btn-block" data-close>بستن</button>`);

  const dayMetric = (rec) => {
    if (!rec) return { study: 0, tests: 0, sleep: 0 };
    const study = Object.values(rec.subjects || {}).reduce((a, s) => a + (s.studySec || 0) + (s.testSec || 0), 0);
    const tests = Object.values(rec.subjects || {}).reduce((a, s) => a + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0), 0);
    const sleep = sleepDur(rec.sleep?.bed, rec.sleep?.wake) || 0;
    return { study, tests, sleep };
  };
  const renderWeekCmp = () => {
    const a = Number(sheet.querySelector("#wOffA").value) || 0;
    const b = Number(sheet.querySelector("#wOffB").value) || 1;
    const wa = weekStats(weekKeys(a));
    const wb = weekStats(weekKeys(b));
    const dStudy = wa.study - wb.study;
    const dTests = wa.tests - wb.tests;
    const col = (v) => v >= 0 ? "#3dd68c" : "#ff5d5d";
    const arrow = (v) => v >= 0 ? "▲" : "▼";
    const labelOf = (n) => n === 0 ? "این هفته" : n === 1 ? "هفته قبل" : `${dig(n)} هفته قبل`;
    sheet.querySelector("#weekCmpBox").innerHTML = `
      <div class="week-title">هفته ۱ (${labelOf(a)}) ⟷ هفته ۲ (${labelOf(b)})</div>
      <div class="week-grid">
        <div><b>${hm(wa.study)}</b><span>مطالعه</span></div>
        <div><b>${dig(wa.tests)}</b><span>تست</span></div>
        <div><b>${hm(wa.sleep)}</b><span>میانگین خواب</span></div>
        <div><b>${dig(wa.daysActive)}</b><span>روز فعال</span></div>
      </div>
      <div class="week-cmp">
        اختلاف مطالعه: <span style="color:${col(dStudy)}">${arrow(dStudy)} ${hm(Math.abs(dStudy))}</span>
        · تست: <span style="color:${col(dTests)}">${arrow(dTests)} ${dig(Math.abs(dTests))}</span>
      </div>`;
  };
  const fillDaySelect = (ySel, mSel, dSel, preferKey) => {
    const y = Number(ySel.value) || curY;
    const m = Number(mSel.value) || curM;
    const dim = daysInJalaliMonth(y, m);
    let preferD = preferKey ? Number(String(preferKey).split("-")[2]) : Number(dSel.value) || 1;
    if (preferD > dim) preferD = dim;
    dSel.innerHTML = Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      return `<option value="${d}" ${d === preferD ? "selected" : ""}>${dig(d)}</option>`;
    }).join("");
  };
  const dayKeyFrom = (ySel, mSel, dSel) => {
    const y = Number(ySel.value) || curY;
    const m = Number(mSel.value) || curM;
    const d = Number(dSel.value) || 1;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const { jd: curD } = parseKey(today);
  const { jd: ydayD, jm: ydayM, jy: ydayY } = parseKey(yday);
  fillDaySelect(sheet.querySelector("#daY"), sheet.querySelector("#daM"), sheet.querySelector("#daD"), today);
  // set B to yesterday defaults
  sheet.querySelector("#dbY").value = String(ydayY);
  sheet.querySelector("#dbM").value = String(ydayM);
  fillDaySelect(sheet.querySelector("#dbY"), sheet.querySelector("#dbM"), sheet.querySelector("#dbD"), yday);

  const renderDayCmp = async () => {
    const map = Object.fromEntries((state.liveMode ? (state.days || []) : await db.all("days")).map((d) => [d.date, d]));
    const a = dayKeyFrom(sheet.querySelector("#daY"), sheet.querySelector("#daM"), sheet.querySelector("#daD"));
    const b = dayKeyFrom(sheet.querySelector("#dbY"), sheet.querySelector("#dbM"), sheet.querySelector("#dbD"));
    const ma = dayMetric(map[a]);
    const mb = dayMetric(map[b]);
    const dStudy = ma.study - mb.study;
    const dTests = ma.tests - mb.tests;
    const dSleep = ma.sleep - mb.sleep;
    const col = (v) => v >= 0 ? "#3dd68c" : "#ff5d5d";
    const arrow = (v) => v >= 0 ? "▲" : "▼";
    sheet.querySelector("#cmpBox").innerHTML = `
      <div class="week-title">${formatShort(a)} ⟷ ${formatShort(b)}</div>
      <div class="week-grid">
        <div><b>${hm(ma.study)}</b><span>مطالعه مبنا</span></div>
        <div><b>${hm(mb.study)}</b><span>مطالعه مقایسه</span></div>
        <div><b style="color:${col(dStudy)}">${arrow(dStudy)} ${hm(Math.abs(dStudy))}</b><span>اختلاف</span></div>
        <div><b style="color:${col(dTests)}">${arrow(dTests)} ${dig(Math.abs(dTests))}</b><span>اختلاف تست</span></div>
      </div>
      <div class="week-cmp">خواب: ${hm(ma.sleep)} ⟷ ${hm(mb.sleep)}
        <span style="color:${col(dSleep)}">(${arrow(dSleep)} ${hm(Math.abs(dSleep))})</span></div>`;
  };

  let currentTab = "study";
  let chartZoom = 1;
  const draw = async (tab) => {
    currentTab = tab || currentTab;
    const month = Number(sheet.querySelector("#ms").value);
    const jy = Number(sheet.querySelector("#my")?.value) || parseKey(today).jy;
    const map = Object.fromEntries((state.liveMode ? (state.days || []) : await db.all("days")).map((d) => [d.date, d]));
    const dim = daysInJalaliMonth(jy, month);
    const points = monthKeys(jy, month).slice(0, dim).map((date) => {
      const rec = map[date];
      if (!rec) return { date, value: 0 };
      if (currentTab === "test") return { date, value: Object.values(rec.subjects || {}).reduce((a, s) => a + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0), 0) };
      if (currentTab === "sleep") return { date, value: Math.round(((sleepDur(rec.sleep?.bed, rec.sleep?.wake) || 0) / 3600) * 10) / 10 };
      return { date, value: Math.round((Object.values(rec.subjects || {}).reduce((a, s) => a + (s.studySec || 0) + (s.testSec || 0), 0) / 3600) * 10) / 10 };
    });
    const host = sheet.querySelector("#chart");
    host.style.transform = `scale(${chartZoom})`;
    host.style.transformOrigin = "top center";
    lineChart(host, points, currentTab === "test" ? "#ff5d5d" : currentTab === "sleep" ? "#7eb6ff" : GOLD,
      (sum) => currentTab === "test" ? `مجموع تست ${dig(sum)}` : `مجموع ${dig(Math.round(sum * 10) / 10)} ساعت`);
  };
  const toggleChartFs = () => {
    const host = sheet.querySelector("#chart");
    host.classList.toggle("chart-fs");
    document.body.classList.toggle("chart-fs-open", host.classList.contains("chart-fs"));
  };

  sheet.querySelector("#wOffA").onchange = renderWeekCmp;
  sheet.querySelector("#wOffB").onchange = renderWeekCmp;
  sheet.querySelectorAll("[data-wq]").forEach((b) => {
    b.onclick = () => {
      const [x, y] = b.dataset.wq.split(",").map(Number);
      // data-wq="0,1" → این هفته for week1; "1,0" → هفته قبل for week2
      if (x === 0) sheet.querySelector("#wOffA").value = "0";
      if (y === 1 && x === 0) { /* این هفته on line 1 */ sheet.querySelector("#wOffA").value = "0"; }
      if (x === 1 && y === 0) sheet.querySelector("#wOffB").value = "1";
      if (b.textContent.includes("این هفته")) sheet.querySelector("#wOffA").value = "0";
      if (b.textContent.includes("هفته قبل")) sheet.querySelector("#wOffB").value = "1";
      renderWeekCmp();
    };
  });
  ["daY","daM","dbY","dbM"].forEach((id) => {
    sheet.querySelector("#" + id).onchange = () => {
      if (id.startsWith("da")) fillDaySelect(sheet.querySelector("#daY"), sheet.querySelector("#daM"), sheet.querySelector("#daD"));
      else fillDaySelect(sheet.querySelector("#dbY"), sheet.querySelector("#dbM"), sheet.querySelector("#dbD"));
      renderDayCmp();
    };
  });
  sheet.querySelector("#daD").onchange = renderDayCmp;
  sheet.querySelector("#dbD").onchange = renderDayCmp;
  sheet.querySelectorAll("[data-dq]").forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.dq === "today" ? today : yday;
      const { jy, jm, jd } = parseKey(key);
      const prefix = b.dataset.dq === "today" ? "da" : "db";
      // امروز → روز1, دیروز → روز2 (or both set for convenience)
      if (b.dataset.dq === "today") {
        sheet.querySelector("#daY").value = String(jy);
        sheet.querySelector("#daM").value = String(jm);
        fillDaySelect(sheet.querySelector("#daY"), sheet.querySelector("#daM"), sheet.querySelector("#daD"), key);
      } else {
        sheet.querySelector("#dbY").value = String(jy);
        sheet.querySelector("#dbM").value = String(jm);
        fillDaySelect(sheet.querySelector("#dbY"), sheet.querySelector("#dbM"), sheet.querySelector("#dbD"), key);
      }
      renderDayCmp();
    };
  });
  sheet.querySelector("#ms").onchange = () => draw(currentTab);
  const myEl = sheet.querySelector("#my");
  if (myEl) myEl.onchange = () => draw(currentTab);
  sheet.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => draw(b.dataset.tab));
  sheet.querySelector("#zIn").onclick = () => { chartZoom = Math.min(2.2, chartZoom + 0.15); draw(currentTab); };
  sheet.querySelector("#zOut").onclick = () => { chartZoom = Math.max(0.7, chartZoom - 0.15); draw(currentTab); };
  sheet.querySelector("#zFs").onclick = toggleChartFs;
  sheet.querySelector("#chart").ondblclick = (e) => { e.preventDefault(); toggleChartFs(); };
  sheet.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => {
    document.body.classList.remove("chart-fs-open");
    closeSheet();
  });
  renderWeekCmp();
  await renderDayCmp();
  await draw("study");
}
function weekKeys(offsetWeeks = 0) {
  // last 7 jalali-ish calendar days based on viewing / today keys stored as YYYY-MM-DD jalali
  const base = state.today || todayKey();
  // approximate: use days array sorted, take last 7 from today going back
  const all = (state.days || []).map((d) => d.date).sort();
  const keys = [];
  const { jy, jm, jd } = parseKey(base);
  // walk back day by day using Date conversion is hard for jalali; use existing days + synthetic
  // Simple: collect from sorted days ending at today, 7 entries
  const idx = all.indexOf(base);
  const slice = idx >= 0 ? all.slice(Math.max(0, idx - 6 - offsetWeeks * 7), idx + 1 - offsetWeeks * 7) : all.slice(-7);
  return slice.length ? slice : [base];
}
function weekStats(keys) {
  const map = Object.fromEntries((state.days || []).map((d) => [d.date, d]));
  let study = 0, tests = 0, sleep = 0, sleepN = 0, daysActive = 0;
  keys.forEach((k) => {
    const d = map[k];
    if (!d) return;
    const tot = Object.values(d.subjects || {}).reduce((a, s) => a + (s.studySec || 0) + (s.testSec || 0), 0);
    const t = Object.values(d.subjects || {}).reduce((a, s) => a + (s.correct || 0) + (s.wrong || 0) + (s.blank || 0), 0);
    if (tot > 0 || t > 0) daysActive++;
    study += tot; tests += t;
    const sd = sleepDur(d.sleep?.bed, d.sleep?.wake);
    if (sd) { sleep += sd; sleepN++; }
  });
  return { study, tests, sleep: sleepN ? sleep / sleepN : 0, daysActive, keys };
}
function weeklySummaryHtml() {
  const w0 = weekStats(weekKeys(0));
  const w1 = weekStats(weekKeys(1));
  const diff = w0.study - w1.study;
  const pct = w1.study > 0 ? Math.round((diff / w1.study) * 100) : (w0.study > 0 ? 100 : 0);
  const arrow = diff >= 0 ? "▲" : "▼";
  const col = diff >= 0 ? "#3dd68c" : "#ff5d5d";
  return `<div class="week-title">خلاصه ۷ روز اخیر</div>
    <div class="week-grid">
      <div><b>${hm(w0.study)}</b><span>مطالعه</span></div>
      <div><b>${dig(w0.tests)}</b><span>تست</span></div>
      <div><b>${hm(w0.sleep)}</b><span>میانگین خواب</span></div>
      <div><b>${dig(w0.daysActive)}</b><span>روز فعال</span></div>
    </div>
    <div class="week-cmp" style="color:${col}">مقایسه با هفته قبل: ${arrow} ${hm(Math.abs(diff))} (${diff >= 0 ? "+" : ""}${dig(pct)}٪)</div>
    <div class="hint">هفته قبل: ${hm(w1.study)} مطالعه · ${dig(w1.tests)} تست</div>`;
}
function openNotesView(id) {
  const s = state.day?.subjects?.[id];
  if (!s) return;
  const perm = (state.notes || []).find((n) => n.subjectId === id);
  openSheet(`<h3>یادداشت · ${escapeHtml(s.name || "")}</h3>
    ${perm?.text ? `<div class="field"><label>دائمی</label><div class="field-view">${escapeHtml(perm.text)}</div></div>` : ""}
    ${s.dailyNote ? `<div class="field"><label>همین روز</label><div class="field-view">${escapeHtml(s.dailyNote)}</div></div>` : ""}
    ${!perm?.text && !s.dailyNote ? `<p class="hint">یادداشتی نیست</p>` : ""}
    <button class="ghost btn-block" data-close>بستن</button>`);
}
function openNotes(id) {
  if (state.readonly || state.liveMode) return openNotesView(id);
  const s = state.day.subjects[id]; const perm = state.notes.find((n) => n.subjectId === id);
  openSheet(`<h3>یادداشت</h3><div class="field"><label>دائمی</label><textarea id="p">${perm?.text || ""}</textarea></div><div class="field"><label>همین روز</label><textarea id="d">${s.dailyNote || ""}</textarea></div><button class="primary" id="ok">ذخیره</button><button class="ghost btn-block" data-close>بستن</button>`);
  sheet.querySelector("#ok").onclick = async () => {
    const text = sheet.querySelector("#p").value.trim();
    if (perm) { perm.text = text; await db.put("notes", perm); }
    else if (text) { const note = { id: uid("note"), subjectId: id, kind: "permanent", text, updatedAt: Date.now() }; state.notes.push(note); await db.put("notes", note); }
    s.dailyNote = sheet.querySelector("#d").value.trim(); touchSubject(s); await saveDay(); closeSheet(); render();
  };
}
async function copyText(text) {
  // Prefer execCommand under a user gesture (most reliable on mobile WebView / Chrome)
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:0;opacity:0.01;z-index:99999";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) return true;
  } catch {}
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}
function baseAppUrl() {
  return location.href.split("#")[0].split("?")[0];
}
function showLinkSheet(title, url, hint) {
  openSheet(`<h3>${escapeHtml(title)}</h3>
    <p class="hint">${hint || ""}</p>
    <div class="field"><label>لینک</label>
      <textarea id="copyUrl" rows="3" readonly style="direction:ltr;text-align:left;font-size:.7rem;word-break:break-all">${escapeHtml(url)}</textarea>
    </div>
    <button type="button" class="primary btn-block" id="doCopy">کپی لینک</button>
    <button type="button" class="ghost btn-block" id="doShare">اشتراک سیستم (Share)</button>
    <button type="button" class="ghost btn-block" data-close>بستن</button>`);
  const box = sheet.querySelector("#copyUrl");
  box.onclick = () => { box.focus(); box.select(); };
  // auto-select so user can long-press copy
  setTimeout(() => { try { box.focus(); box.select(); } catch {} }, 50);
  sheet.querySelector("#doCopy").onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    box.focus();
    box.select();
    const ok = await copyText(url);
    const btn = sheet.querySelector("#doCopy");
    btn.textContent = ok ? "✓ کپی شد" : "کپی نشد — متن را نگه دار و Copy بزن";
    if (ok) setTimeout(() => { btn.textContent = "کپی لینک"; }, 2000);
  };
  const sh = sheet.querySelector("#doShare");
  if (!navigator.share) sh.style.display = "none";
  else sh.onclick = async () => {
    try { await navigator.share({ title: "رهگیر مطالعه", url, text: url }); } catch {}
  };
}

function openShare() {
  openSheet(`<h3>اشتراک‌گذاری</h3>
    <p class="hint">لینک زنده کوتاه است. لینک ثابت بدون اینترنت هم کار می‌کند (فقط‌خواندنی).</p>
    <button type="button" class="primary btn-block" id="live">لینک زنده مشاور</button>
    <button type="button" class="ghost btn-block" id="deckLive">لینک زنده تک‌درس</button>
    <button type="button" class="ghost btn-block" id="offline">لینک ثابت فقط‌خواندنی (آفلاین)</button>
    <button type="button" class="ghost btn-block" id="cfgShare">کپی تنظیمات Firebase</button>
    <button type="button" class="ghost btn-block" id="img">عکس PNG</button>
    <button type="button" class="ghost btn-block" id="pdf">PDF</button>
    <button type="button" class="danger btn-block" id="revokeLive">باطل کردن لینک زنده</button>
    <button type="button" class="ghost btn-block" data-close>بستن</button>`);

  sheet.querySelector("#img").onclick = (e) => { e.preventDefault(); sharePng(); };
  sheet.querySelector("#pdf").onclick = () => {
    const panel = document.getElementById("panel");
    printEl.innerHTML = `<div style="background:#000;color:#fff;padding:16px">${panel ? panel.outerHTML : ""}</div>`;
    window.print();
  };

  sheet.querySelector("#cfgShare").onclick = async (e) => {
    e.preventDefault();
    if (!sync.hasConfig(state.firebase)) return alert("ابتدا Firebase را در مدیریت تنظیم کن");
    const text = JSON.stringify({
      apiKey: state.firebase.apiKey,
      projectId: state.firebase.projectId,
      databaseURL: state.firebase.databaseURL
    });
    openSheet(`<h3>تنظیمات Firebase</h3>
      <p class="hint">مشاور یک‌بار این متن را کپی و در فرم اتصال پیست کند.</p>
      <div class="field"><textarea id="cfgout" rows="4" readonly style="direction:ltr;font-size:.7rem">${escapeHtml(text)}</textarea></div>
      <button type="button" class="primary btn-block" id="c2">کپی</button>
      <button type="button" class="ghost btn-block" data-close>بستن</button>`);
    const t = sheet.querySelector("#cfgout");
    setTimeout(() => { t.focus(); t.select(); }, 50);
    sheet.querySelector("#c2").onclick = async (ev) => {
      ev.preventDefault();
      t.select();
      const ok = await copyText(text);
      ev.target.textContent = ok ? "✓ کپی شد" : "دستی کپی کن";
    };
  };

  const makeLive = (mode) => {
    if (!state.syncCode || !sync.hasConfig(state.firebase)) {
      return alert("ابتدا در مدیریت: کد همگام + Firebase را تنظیم کن");
    }
    const code = state.syncCode.trim().toUpperCase();
    const path = mode === "deck"
      ? `#live=${code}/${state.viewing}/deck`
      : `#live=${code}/${state.viewing}`;
    const url = baseAppUrl() + path;
    // SHOW LINK IMMEDIATELY — do not wait for network
    showLinkSheet(
      mode === "deck" ? "لینک زنده تک‌درس" : "لینک زنده پنل",
      url,
      "لینک کوتاه آماده است. با دکمه «کپی لینک» کپی کن. ارسال به سرور در پس‌زمینه انجام می‌شود."
    );
    // background push — never blocks copy UI
    (async () => {
      try {
        const ready = await sync.initSync(state.firebase);
        if (!ready) return;
        await sync.setLiveMeta(code, { revoked: false, date: state.viewing });
        await sync.publishCfg(code, state.firebase);
        await pushLiveNow();
      } catch (err) { console.warn("bg live push", err); }
    })();
  };

  sheet.querySelector("#live").onclick = (e) => { e.preventDefault(); makeLive("panel"); };
  sheet.querySelector("#deckLive").onclick = (e) => { e.preventDefault(); makeLive("deck"); };

  sheet.querySelector("#offline").onclick = async (e) => {
    e.preventDefault();
    openSheet(`<h3>در حال ساخت لینک ثابت…</h3><p class="hint">لطفاً صبر کن</p>`);
    try {
      const token = await buildOfflineToken();
      const url = baseAppUrl() + "#ro=" + token;
      if (url.length > 12000) {
        // too big for URL — download HTML report instead
        downloadOfflineHtml();
        openSheet(`<h3>لینک خیلی بزرگ شد</h3>
          <p class="hint">به‌جای لینک، فایل گزارش HTML دانلود شد. همان فایل را برای مشاور بفرست — بدون اینترنت و فقط‌خواندنی باز می‌شود.</p>
          <button type="button" class="ghost btn-block" data-close>بستن</button>`);
        return;
      }
      showLinkSheet(
        "لینک ثابت فقط‌خواندنی",
        url,
        "بدون Firebase و بدون اینترنت کار می‌کند. مشاور نمی‌تواند چیزی را تغییر دهد. آمار، تاریخچه و تک‌درس‌ها در دسترس است."
      );
    } catch (err) {
      console.warn(err);
      downloadOfflineHtml();
      openSheet(`<h3>لینک ساخته نشد</h3>
        <p class="hint">فایل HTML گزارش دانلود شد — آن را برای مشاور بفرست.</p>
        <button type="button" class="ghost btn-block" data-close>بستن</button>`);
    }
  };

  sheet.querySelector("#revokeLive").onclick = async (e) => {
    e.preventDefault();
    if (!state.syncCode || !sync.hasConfig(state.firebase)) return alert("Firebase تنظیم نیست");
    if (!confirm("لینک زنده باطل شود؟")) return;
    await sync.initSync(state.firebase);
    const ok = await sync.revokeLive(state.syncCode.toUpperCase(), state.viewing);
    alert(ok ? "باطل شد." : "ناموفق");
  };
}

function u8ToB64Url(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunk, u8.length)));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64UrlToU8(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(pad);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function buildOfflineToken() {
  // compact payload: current day + recent days + notes + catalog
  const days = (state.days || []).slice().sort((a, b) => compareKeys(b.date, a.date)).slice(0, 40).map((d) => {
    // strip heavy blobs
    const copy = JSON.parse(JSON.stringify(d));
    delete copy.badge;
    if (copy.subjects) {
      Object.values(copy.subjects).forEach((s) => {
        delete s.badge;
      });
    }
    return copy;
  });
  const payload = {
    v: 1,
    day: days.find((d) => d.date === state.viewing) || state.day,
    days,
    notes: (state.notes || []).map((n) => ({ subjectId: n.subjectId, text: n.text, kind: n.kind })),
    catalog: (state.catalog || []).map((s) => ({ id: s.id, name: s.name, color: s.color, targetSec: s.targetSec })),
    settings: { digits: state.settings.digits },
    readonly: true
  };
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    return "g" + u8ToB64Url(buf);
  }
  return "r" + u8ToB64Url(raw);
}
async function unpackOfflineToken(token) {
  const kind = token[0];
  const body = token.slice(1);
  const u8 = b64UrlToU8(body);
  let json;
  if (kind === "g" && typeof DecompressionStream !== "undefined") {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    json = text;
  } else if (kind === "r") {
    json = new TextDecoder().decode(u8);
  } else {
    // legacy encodeSnapshot
    return decodeSnapshot(token);
  }
  return JSON.parse(json);
}
function downloadOfflineHtml() {
  const payload = {
    day: state.day,
    days: (state.days || []).slice(0, 40),
    notes: state.notes || [],
    catalog: state.catalog || [],
    settings: { digits: state.settings.digits },
    readonly: true
  };
  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>گزارش مطالعه</title>
<style>body{margin:0;background:#0a0a0c;color:#fff;font-family:Tahoma,sans-serif;padding:16px;line-height:1.6}
h1{font-size:1.1rem}h2{font-size:.95rem;color:#e6c878;margin-top:20px}
.card{border:1px solid #333;border-radius:12px;padding:12px;margin:8px 0;background:#12141a}
.muted{color:#888;font-size:.8rem}b{color:#f0d78c}</style></head><body>
<h1>گزارش فقط‌خواندنی · رهگیر مطالعه</h1>
<p class="muted">مشاور نمی‌تواند تغییری ایجاد کند.</p>
<div id="out"></div>
<script>
const D = ${JSON.stringify(payload).replace(/</g, "\\u003c")};
function hm(s){s=Math.max(0,s|0);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+":"+String(m).padStart(2,"0"):m+"د";}
const day=D.day||{};const el=document.getElementById("out");
let html="<div class=card><h2>روز "+(day.date||"")+"</h2>";
const subs=Object.values(day.subjects||{});
subs.forEach(s=>{
  const st=(s.studySec||0)+(s.testSec||0);
  html+="<div class=card><b>"+ (s.name||"") +"</b><br>مطالعه "+hm(s.studySec||0)+" · تست "+hm(s.testSec||0)+" · هدف "+hm(s.targetSec||0);
  if(s.topic) html+="<br>مبحث: "+s.topic;
  if(s.masteryNote) html+="<br>تسلط: "+s.masteryNote;
  if(s.blockers) html+="<br>مانع: "+s.blockers;
  if(s.dailyNote) html+="<br>یادداشت: "+s.dailyNote;
  html+="</div>";
});
html+="</div><h2>تاریخچه</h2>";
(D.days||[]).forEach(d=>{
  let t=0;Object.values(d.subjects||{}).forEach(s=>t+=(s.studySec||0)+(s.testSec||0));
  html+="<div class=card>"+d.date+" · مجموع "+hm(t)+"</div>";
});
el.innerHTML=html;
</script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "study-report-" + (state.viewing || "day") + ".html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function sharePng() {
  closeSheet();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const panel = document.getElementById("panel");
  if (!panel) return alert("پنل پیدا نشد");
  const hide = [];
  panel.querySelectorAll(".drag-handle, .reset-day, .motto-input, [data-score]").forEach((el) => {
    hide.push([el, el.style.visibility]);
    el.style.visibility = "hidden";
  });
  try {
    const scale = Math.min(2, window.devicePixelRatio || 2);
    const rect = panel.getBoundingClientRect();
    const w = Math.ceil(rect.width * scale);
    const h = Math.ceil(rect.height * scale);
    // Clone with inlined styles for foreignObject
    const clone = panel.cloneNode(true);
    clone.querySelectorAll("video").forEach((v) => v.remove());
    const walk = (src, dst) => {
      const st = getComputedStyle(src);
      let css = "";
      for (let i = 0; i < st.length; i++) {
        const prop = st[i];
        css += prop + ":" + st.getPropertyValue(prop) + ";";
      }
      dst.setAttribute("style", css);
      const sc = src.children, dc = dst.children;
      for (let i = 0; i < sc.length; i++) walk(sc[i], dc[i]);
    };
    walk(panel, clone);
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.background = "#000";
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${rect.width}px;height:${rect.height}px;background:#000;transform:scale(${scale});transform-origin:top left">${new XMLSerializer().serializeToString(clone)}</div></foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("blob empty");
    const file = new File([blob], `panel-${state.day.date}.jpg`, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "پنل مطالعه" }); return; } catch {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    // fallback canvas drawing
    try { await sharePngFallback(); } catch (e2) {
      alert("ساخت عکس ممکن نشد: " + (err.message || err));
    }
  } finally {
    hide.forEach(([el, v]) => { el.style.visibility = v; });
  }
}
async function sharePngFallback() {
  const day = state.day;
  const total = dayTotal(day), target = day.targetSec || 1, pct = clamp(total / target * 100), remain = Math.max(0, target - total);
  const subjects = sortedSubjects(day);
  const W = 1080;
  const H = Math.max(1600, 320 + subjects.length * 200);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff"; g.font = "700 34px Tahoma"; g.textAlign = "right";
  g.fillText(formatLong(day.date), W - 60, 80);
  g.fillStyle = "#3dd68c"; g.textAlign = "left"; g.font = "400 20px Tahoma";
  g.fillText("آخرین به‌روزرسانی", 60, 60);
  g.font = "700 28px Tahoma";
  g.fillText(day.updatedAt ? new Date(day.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—", 60, 95);
  if (day.motto) {
    g.fillStyle = "rgba(255,255,255,0.85)"; g.textAlign = "center"; g.font = "400 24px Tahoma";
    g.fillText(day.motto, W / 2, 140);
  }
  drawRing(g, 150, 250, 64, pct, GOLD, Math.round(pct) + "%", "پیشرفت روز");
  g.fillStyle = "#fff"; g.textAlign = "right"; g.font = "400 22px Tahoma"; g.fillText("مطالعه شده", W - 60, 210);
  g.font = "700 40px Tahoma"; g.fillText(String(hm(total)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), W - 60, 255);
  g.textAlign = "left"; g.font = "400 22px Tahoma"; g.fillText("باقی مانده", 260, 210);
  g.font = "700 40px Tahoma"; g.fillText(String(hm(remain)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)), 260, 255);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(260, 280, W - 340, 12);
  g.fillStyle = GOLD; g.fillRect(260, 280, (W - 340) * pct / 100, 12);
  let y = 360;
  subjects.forEach((s) => {
    const sum = totalOf(s);
    g.fillStyle = s.color || GOLD; g.fillRect(W - 80, y - 14, 10, 22);
    g.fillStyle = "#fff"; g.font = "700 26px Tahoma"; g.textAlign = "right"; g.fillText(s.name, W - 95, y + 4);
    g.textAlign = "left"; g.font = "400 20px Tahoma"; g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(hm(s.studySec || 0) + " مطالعه  |  " + hm(s.testSec || 0) + " تست", 60, y + 4);
    y += 48;
  });
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `panel-${day.date}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
}
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function drawRing(g, x, y, r, pct, color, main, sub) {
  g.beginPath(); g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 10; g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.strokeStyle = color; g.lineCap = "round"; g.lineWidth = 10;
  g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + clamp(pct) / 100 * Math.PI * 2); g.stroke();
  g.fillStyle = "#fff"; g.font = "700 20px Tahoma"; g.textAlign = "center"; g.fillText(main, x, y);
  g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "400 13px Tahoma"; g.fillText(sub, x, y + 20);
}

function bootDeckViewer(token) {
  state.readonly = true;
  state.liveMode = false;
  document.getElementById("dock").style.display = "none";
  miniEl.style.display = ""; miniEl.classList.remove("show");
  try {
    const data = decodeSnapshot(token);
    state.day = data.day;
    state.viewing = state.day.date;
    state.today = state.day.date;
    state.days = [state.day];
    state.deckIndex = 0;
    renderSubjectDeck(true);
  } catch {
    appEl.innerHTML = "<p style='color:#fff;padding:16px'>لینک نامعتبر است.</p>";
  }
}
function renderReadonly(token) {
  document.getElementById("dock").style.display = "none";
  miniEl.style.display = ""; miniEl.classList.remove("show");
  state.readonly = true;
  try {
    const data = decodeSnapshot(token);
    state.day = data.day;
    if (data.motto && state.day) state.day.motto = data.motto;
    if (data.settings?.digits) state.settings.digits = data.settings.digits;
    state.viewing = state.day.date;
    state.today = state.day.date;
    state.days = [state.day];
    state.notes = [];
    state.catalog = [];
    state.sessions = [];
    state.timer = null;
    render();
    // block interactions
    appEl.style.pointerEvents = "none";
  } catch { appEl.innerHTML = "<p style='color:#fff;padding:16px'>لینک نامعتبر است.</p>"; }
}


async function bootOfflineReport(token) {
  state.readonly = true;
  state.liveMode = false;
  try {
    const data = await unpackOfflineToken(token);
    state.day = data.day;
    state.days = data.days || [data.day];
    state.notes = data.notes || [];
    state.catalog = data.catalog || [];
    state.viewing = data.day?.date || state.today;
    if (data.settings?.digits) state.settings.digits = data.settings.digits;
    state.timer = null;
    document.getElementById("dock").style.display = "";
    document.getElementById("dock").innerHTML = `<div class="dock-island"><div class="dock-inner live-dock">
      <button type="button" data-nav="history">تاریخچه</button>
      <button type="button" data-nav="stats">آمار</button>
      <button type="button" data-nav="subj">اطلاعات تک‌درس</button>
    </div></div>`;
    document.getElementById("dock").onclick = (e) => {
      const nav = e.target.closest("[data-nav]")?.dataset.nav;
      if (nav === "history") openHistoryLive();
      if (nav === "stats") openStats();
      if (nav === "subj") { state.liveDeck = true; renderLiveMini(); renderSubjectDeck(); }
    };
    render();
  } catch (e) {
    console.warn(e);
    appEl.innerHTML = `<p style="padding:16px;color:#fff">لینک ثابت خراب یا خیلی قدیمی است.</p>`;
  }
}
async function bootLiveViewer(token) {
  state.liveMode = true;
  state.readonly = true;
  miniEl.classList.remove("show");
  let decoded = token;
  try { decoded = decodeURIComponent(token); } catch {}
  // formats: CODE/DATE  or  CODE/DATE/deck  or legacy CODE/DATE/cfgBase64
  const parts = decoded.split("/").filter(Boolean);
  const code = (parts[0] || "").trim().toUpperCase();
  const date = parts[1] || "";
  const third = (parts[2] || "").trim();
  const wantDeck = third.toLowerCase() === "deck";
  const cfgPart = wantDeck ? parts.slice(3).join("/") : (third && third.toLowerCase() !== "deck" ? parts.slice(2).join("/") : "");

  appEl.innerHTML = `<p style="padding:16px;color:#fff">در حال اتصال به پنل زنده…</p>`;

  // 1) config from URL (legacy long links)
  if (cfgPart && cfgPart.length > 20) {
    try {
      state.firebase = JSON.parse(decodeURIComponent(escape(atob(cfgPart))));
      await db.kvSet("firebase", state.firebase);
    } catch (e) { console.warn("legacy cfg", e); }
  }
  state.firebase = state.firebase || (await db.kvGet("firebase")) || null;

  // 2) if still no config, ask advisor once (paste JSON or fields)
  if (!sync.hasConfig(state.firebase)) {
    await new Promise((res) => {
      openSheet(`<h3>اتصال مشاور</h3>
        <p class="hint">یک‌بار تنظیمات Firebase دانش‌آموز را وارد کن (دکمه «کپی تنظیمات Firebase» در گوشی دانش‌آموز).</p>
        <div class="field"><label>پیست JSON</label><textarea id="fb_json" rows="3" placeholder='{"apiKey":"...","projectId":"...","databaseURL":"..."}' style="direction:ltr;font-size:.7rem"></textarea></div>
        <p class="hint">یا جداگانه:</p>
        <div class="field"><label>apiKey</label><input id="fb_key" style="direction:ltr"></div>
        <div class="field"><label>projectId</label><input id="fb_pid" style="direction:ltr"></div>
        <div class="field"><label>databaseURL</label><input id="fb_url" style="direction:ltr"></div>
        <button class="primary btn-block" id="ok">اتصال</button>`);
      sheet.querySelector("#ok").onclick = async () => {
        const raw = sheet.querySelector("#fb_json").value.trim();
        if (raw) {
          try {
            const j = JSON.parse(raw);
            state.firebase = { apiKey: j.apiKey, projectId: j.projectId, databaseURL: j.databaseURL };
          } catch { alert("JSON نامعتبر"); return; }
        } else {
          state.firebase = {
            apiKey: sheet.querySelector("#fb_key").value.trim(),
            projectId: sheet.querySelector("#fb_pid").value.trim(),
            databaseURL: sheet.querySelector("#fb_url").value.trim()
          };
        }
        if (!sync.hasConfig(state.firebase)) { alert("ناقص است"); return; }
        await db.kvSet("firebase", state.firebase);
        closeSheet();
        res();
      };
    });
  }

  const ok = await sync.initSync(state.firebase);
  if (!ok) {
    appEl.innerHTML = `<p style="padding:16px;color:#fff">اتصال Firebase ناموفق — VPN و تنظیمات را چک کن.</p>`;
    return;
  }

  // try pull cfg from room (updates local if student republished)
  try {
    const remoteCfg = await sync.fetchCfg(code);
    if (remoteCfg && remoteCfg.apiKey) {
      state.firebase = {
        apiKey: remoteCfg.apiKey,
        projectId: remoteCfg.projectId,
        databaseURL: remoteCfg.databaseURL
      };
      await db.kvSet("firebase", state.firebase);
      await sync.initSync(state.firebase);
    }
  } catch {}

  const meta = await sync.getLiveMeta(code);
  if (meta?.revoked) {
    appEl.innerHTML = `<p style="padding:24px;color:#ff8a90;text-align:center">این لینک زنده باطل شده است.</p>`;
    return;
  }
  if (!code || !date) {
    appEl.innerHTML = `<p style="padding:16px;color:#fff">لینک ناقص است. فرمت درست: #live=کد/تاریخ</p>`;
    return;
  }
  state.syncCode = code;
  state.viewing = date;
  state.liveDeck = !!wantDeck;
  ensureLiveDock();
  attachLiveSub(code, date, wantDeck);
  injectAdvisorNoteBtn(code, date);
  startUiTick();
  if (wantDeck) state.deckIndex = 0;
}

function attachLiveSub(code, date, deckOnly) {
  sync.setViewerPresence(code, date, { viewing: true });
  ensureLiveDock();
  bindLiveDock(code, date);
  const applyLivePayload = (payload) => {
    if (!payload) return;
    if (payload.revoked) {
      appEl.innerHTML = `<p style="padding:24px;color:#ff8a90;text-align:center">لینک باطل شد.</p>`;
      return;
    }
    // timer-only packet from /timer child
    if (payload._timerOnly) {
      if (payload.timer && payload.timer.status && payload.timer.status !== "finished" && payload.timer.status !== "off") {
        state.timer = normalizeTimer(payload.timer);
      } else {
        state.timer = null;
      }
      renderLiveMini();
      return;
    }
    if (payload.day) state.day = payload.day;
    if (payload.days) state.days = payload.days;
    if (payload.catalog) state.catalog = payload.catalog;
    if (payload.notes) state.notes = payload.notes;
    if (payload.timer && payload.timer.status && payload.timer.status !== "finished" && payload.timer.status !== "off") {
      state.timer = normalizeTimer(payload.timer);
    } else if (payload.timer != null) {
      state.timer = null;
    }
    if (deckOnly || state.liveDeck) {
      state.liveDeck = true;
      renderSubjectDeck();
    } else {
      render();
    }
    renderLiveMini();
    ensureLiveDock();
  };
  sync.subscribeLiveDay(code, date, applyLivePayload);
  // keep subscription alive (stale connection fix)
  setInterval(() => {
    sync.subscribeLiveDay(code, date, applyLivePayload);
  }, 45000);
  setInterval(async () => {
    try {
      const meta = await sync.getLiveMeta(code);
      if (meta?.revoked) {
        appEl.innerHTML = `<p style="padding:24px;color:#ff8a90;text-align:center">این لینک زنده باطل شده است.</p>`;
      }
    } catch {}
  }, 20000);
  setInterval(() => { sync.setViewerPresence(code, date, { viewing: true }); }, 12000);
}

function normalizeTimer(t) {
  if (!t || typeof t !== "object") return null;
  const out = { ...t };
  if (out.segments && !Array.isArray(out.segments)) {
    out.segments = Object.values(out.segments).filter(Boolean);
  }
  if (!Array.isArray(out.segments)) out.segments = [];
  return out;
}
function renderLiveMini() {
  const t = state.timer;
  const onMain = state.liveMode && !state.liveDeck && !overlay.classList.contains("open");
  miniEl.classList.add("live-viewer");
  if (!t || t.status === "finished" || !onMain) {
    miniEl.classList.remove("show");
    miniEl.style.display = "";
    miniEl.innerHTML = "";
    return;
  }
  const sub = state.day?.subjects?.[t.subjectId] || state.catalog?.find((s) => s.id === t.subjectId);
  miniEl.style.display = "flex";
  miniEl.classList.add("show");
  const act = t.activity === "test" ? "تست" : "مطالعه";
  const paused = t.status === "paused";
  miniEl.innerHTML = `<div class="mini-main live-mini-only"><div class="mini-meta"><span class="mini-name">${escapeHtml(sub?.name || "درس")}</span><span class="mini-act">${act}${paused ? " · مکث" : ""}</span></div><div class="mini-clock">${formatHMS(elapsedMs(t))}</div></div>`;
}

function renderSubjectDeck(fromStudent) {
  const day = state.day;
  if (!day) { appEl.innerHTML = `<p style="padding:16px;color:#fff">داده‌ای نیست</p>`; return; }
  const subs = sortedSubjects(day);
  if (!subs.length) { appEl.innerHTML = `<p style="padding:16px;color:#fff">درسی نیست</p>`; return; }
  let idx = state.deckIndex || 0;
  if (idx < 0 || idx >= subs.length) idx = 0;
  state.deckIndex = idx;
  const s = subs[idx];
  const live = subjectLive(s);
  const total = live.sum;
  const c = s.correct || 0, w = s.wrong || 0, b = s.blank || 0;
  const tests = c + w + b;
  const denom = Math.max(1, tests);
  const neg = scorePct(c, w, b);
  const pct = s.targetSec ? clamp(total / s.targetSec * 100) : 0;
  const remain = Math.max(0, (s.targetSec || 0) - total);

  appEl.innerHTML = `<div class="deck-page" id="deck">
    <header class="deck-header">
      <button type="button" class="ghost sm" id="deckBack">${fromStudent && !state.liveMode ? "بازگشت" : "پنل کلی"}</button>
      <span class="deck-pager">${dig(idx + 1)} / ${dig(subs.length)}</span>
      <div class="deck-nav-btns">
        <button type="button" class="ghost sm" id="deckPrev" ${idx <= 0 ? "disabled" : ""}>›</button>
        <button type="button" class="ghost sm" id="deckNext" ${idx >= subs.length - 1 ? "disabled" : ""}>‹</button>
      </div>
    </header>
    <p class="deck-swipe-hint">برای جابجایی بین درس‌ها به راست یا چپ بکشید</p>

    <article class="deck-sheet" style="--accent:${s.color}">
      <div class="deck-title-row">
        <h1 style="color:${s.color}">${escapeHtml(s.name)}</h1>
        <span class="deck-badge">${num(Math.round(pct))}٪</span>
      </div>

      <section class="deck-section">
        <h3>زمان</h3>
        <div class="deck-metrics">
          <div class="dm"><small>کل اختصاص‌یافته</small><b>${hm(total)}</b></div>
          <div class="dm"><small>هدف درس</small><b>${hm(s.targetSec || 0)}</b></div>
          <div class="dm"><small>باقی‌مانده</small><b>${hm(remain)}</b></div>
        </div>
        <div class="track deck-track"><i style="width:${pct}%;background:${s.color}"></i></div>
        <div class="deck-metrics two">
          <div class="dm"><small>مطالعه / کلاس</small><b>${hm(live.studySec)}</b></div>
          <div class="dm"><small>تست</small><b>${hm(live.testSec)}</b></div>
        </div>
      </section>

      ${tests > 0 ? `<section class="deck-section">
        <h3>تست‌ها</h3>
        <div class="tests">
          <div class="test-row"><span class="tl">صحیح</span><i class="tb ok" style="width:${(c/denom)*100}%"></i><b>${num(c)}</b></div>
          <div class="test-row"><span class="tl">غلط</span><i class="tb bad" style="width:${(w/denom)*100}%"></i><b>${num(w)}</b></div>
          <div class="test-row"><span class="tl">نزده</span><i class="tb blank" style="width:${(b/denom)*100}%"></i><b>${num(b)}</b></div>
          <div class="test-sum"><span>مجموع ${num(tests)}</span><span>منفی ${neg == null ? "—" : dig(neg.toFixed(1)) + "٪"}</span></div>
        </div>
        ${s.practice ? `<p class="deck-sub">تمرین: ${num(s.practice)}</p>` : ""}
      </section>` : (s.practice ? `<section class="deck-section"><h3>تمرین</h3><p class="deck-sub">${num(s.practice)}</p></section>` : "")}

      ${s.quality ? `<section class="deck-section"><h3>نمره مطالعه</h3><p class="deck-sub">${num(s.quality)} / ۱۰</p></section>` : ""}

      ${s.topic ? `<section class="deck-section"><h3>مبحث مطالعه‌شده</h3><p class="deck-body">${escapeHtml(s.topic)}</p></section>` : ""}
      ${s.masteryNote ? `<section class="deck-section"><h3>کیفیت یادگیری و تسلط</h3><p class="deck-body">${escapeHtml(s.masteryNote)}</p></section>` : ""}
      ${s.blockers ? `<section class="deck-section"><h3>مشکلات و موانع</h3><p class="deck-body">${escapeHtml(s.blockers)}</p></section>` : ""}
      ${s.dailyNote ? `<section class="deck-section"><h3>یادداشت روز</h3><p class="deck-body">${escapeHtml(s.dailyNote)}</p></section>` : ""}

      ${Array.isArray(s.todos) && s.todos.length ? `<section class="deck-section"><h3>کارها</h3>
        <div class="todo-inline">${s.todos.map((t) => {
          const st = t.status || (t.done ? "done" : "open");
          const mark = st === "done" ? "✓" : st === "half" ? "◐" : "✕";
          return `<div class="todo-line st-${st === "done" ? "done" : st === "half" ? "half" : "open"}"><span class="todo-mark">${mark}</span><span class="todo-text">${escapeHtml(t.text)}</span>${t.range?`<span class="todo-time">${escapeHtml(t.range)}</span>`:""}</div>`;
        }).join("")}</div>
      </section>` : ""}
    </article>
    <p class="deck-swipe-hint">بکش چپ/راست برای درس بعدی · قبلی</p>
  </div>`;

  const go = (n) => {
    state.deckIndex = Math.max(0, Math.min(subs.length - 1, n));
    renderSubjectDeck(fromStudent);
  };
  document.getElementById("deckPrev").onclick = () => go(idx - 1);
  document.getElementById("deckNext").onclick = () => go(idx + 1);
  document.getElementById("deckBack").onclick = () => {
    state.liveDeck = false;
    if (state.liveMode) {
      document.getElementById("dock").style.display = "";
      render();
      renderLiveMini();
      ensureLiveDock();
    } else {
      render();
    }
  };

  const sheet = document.querySelector(".deck-sheet");
  let sx = 0;
  sheet.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  sheet.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) go(idx + 1); else go(idx - 1);
  }, { passive: true });
  let mx = null;
  sheet.addEventListener("mousedown", (e) => { mx = e.clientX; });
  sheet.addEventListener("mouseup", (e) => {
    if (mx == null) return;
    const dx = e.clientX - mx; mx = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) go(idx + 1); else go(idx - 1);
  });
}

function ensureLiveDock() {
  const dock = document.getElementById("dock");
  if (!dock || !state.liveMode) return;
  dock.style.display = "";
  dock.hidden = false;
  dock.style.visibility = "visible";
  dock.style.opacity = "1";
  // RTL: last button appears leftmost
  dock.innerHTML = `<div class="dock-island"><div class="dock-inner live-dock">
    <button type="button" data-nav="history">تاریخچه</button>
    <button type="button" data-nav="stats">آمار</button>
    <button type="button" data-nav="subj">اطلاعات تک‌درس</button>
    <button type="button" class="dock-note-btn" data-nav="note">یادداشت به دانش‌آموز</button>
  </div></div>`;
  if (state.syncCode && state.viewing) bindLiveDock(state.syncCode.toUpperCase(), state.viewing);
}

function openAdvisorCompose(code, date) {
  const dock = document.getElementById("dock");
  if (dock) dock.style.display = "none";
  const oldNote = document.getElementById("adv-note-btn");
  if (oldNote) oldNote.remove();
  sync.initSync(state.firebase).catch(() => {});
  openSheet(`<div class="adv-compose">
    <div class="adv-compose-head">
      <h3>پیام به دانش‌آموز</h3>
      <p class="hint">یکی را انتخاب کن</p>
    </div>
    <div class="adv-choice">
      <button type="button" class="adv-choice-btn" id="pickText">📝 ارسال متن</button>
      <button type="button" class="adv-choice-btn" id="pickVoice">🎙 ارسال ویس</button>
    </div>
    <div id="advPanel"></div>
    <button type="button" class="ghost btn-block" id="cancelNote">انصراف</button>
  </div>`);
  const restore = () => { ensureLiveDock(); bindLiveDock(code, date); };
  sheet.querySelector("#cancelNote").onclick = () => { closeSheet(); restore(); };
  const panel = sheet.querySelector("#advPanel");

  sheet.querySelector("#pickText").onclick = () => {
    panel.innerHTML = `<div class="adv-panel-box">
      <label class="adv-label">متن پیام</label>
      <textarea id="nt" rows="5" class="adv-textarea" placeholder="پیامت را بنویس…"></textarea>
      <div id="sendWrap"></div>
    </div>`;
    const ta = panel.querySelector("#nt");
    const wrap = panel.querySelector("#sendWrap");
    const refresh = () => {
      const has = ta.value.trim().length > 0;
      wrap.innerHTML = has
        ? `<button type="button" class="primary btn-block" id="ok">ارسال 💥</button>`
        : "";
      const ok = wrap.querySelector("#ok");
      if (ok) ok.onclick = async () => {
        const text = ta.value.trim();
        if (!text) return;
        ok.disabled = true;
        ok.textContent = "…";
        if (!(await sync.initSync(state.firebase))) {
          ok.disabled = false; ok.textContent = "ارسال 💥";
          alert("Firebase وصل نیست"); return;
        }
        const sent = await sync.pushAdvisorNote(code, { text, from: "مشاور", date });
        if (!sent) { ok.disabled = false; ok.textContent = "ارسال 💥"; alert("ارسال نشد"); return; }
        closeSheet(); restore();
      };
    };
    ta.addEventListener("input", refresh);
    ta.focus();
  };

  sheet.querySelector("#pickVoice").onclick = () => {
    let mediaRec = null, chunks = [], voiceB64 = null, voiceMime = null, phase = "idle";
    panel.innerHTML = `<div class="adv-panel-box">
      <div class="adv-voice-card">
        <div class="adv-voice-top">
          <span class="adv-voice-title">پیام صوتی</span>
          <span id="voiceStatus" class="adv-voice-status">آماده ضبط</span>
        </div>
        <div class="adv-voice-wave" id="voiceWave"></div>
        <button type="button" class="adv-rec-btn" id="recVoice">🎙 ضبط ویس</button>
      </div>
    </div>`;
    const btn = panel.querySelector("#recVoice");
    const st = panel.querySelector("#voiceStatus");
    const wave = panel.querySelector("#voiceWave");
    btn.onclick = async () => {
      if (phase === "idle") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          mediaRec = new MediaRecorder(stream);
          mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
          mediaRec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            wave.classList.remove("recording");
            const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
            if (blob.size > 350000) {
              st.textContent = "خیلی طولانی";
              phase = "idle";
              btn.textContent = "🎙 ضبط ویس";
              return;
            }
            const buf = await blob.arrayBuffer();
            const u8 = new Uint8Array(buf);
            let s = "";
            for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
            voiceB64 = btoa(s);
            voiceMime = blob.type || "audio/webm";
            phase = "ready";
            st.textContent = "آماده ارسال · " + Math.round(blob.size / 1024) + "KB";
            btn.textContent = "ارسال 💥";
          };
          mediaRec.start();
          phase = "recording";
          wave.classList.add("recording");
          btn.textContent = "درحال ضبط ❤️";
          st.textContent = "در حال ضبط… دوباره بزن تا تمام شود";
        } catch {
          st.textContent = "میکروفون در دسترس نیست";
        }
        return;
      }
      if (phase === "recording") {
        try { mediaRec.stop(); } catch {}
        return;
      }
      if (phase === "ready") {
        btn.disabled = true;
        btn.textContent = "…";
        if (!(await sync.initSync(state.firebase))) {
          btn.disabled = false; btn.textContent = "ارسال 💥";
          alert("Firebase وصل نیست"); return;
        }
        const sent = await sync.pushAdvisorNote(code, {
          text: "🎤 پیام صوتی",
          voice: voiceB64,
          voiceMime,
          from: "مشاور",
          date
        });
        if (!sent) {
          btn.disabled = false; btn.textContent = "ارسال 💥";
          alert("ارسال نشد"); return;
        }
        closeSheet(); restore();
      }
    };
  };
}

function bindLiveDock(code, date) {
  const dock = document.getElementById("dock");
  if (!dock) return;
  dock.onclick = (e) => {
    const nav = e.target.closest("[data-nav]")?.dataset.nav;
    if (nav === "history") openHistoryLive();
    if (nav === "stats") openStats();
    if (nav === "subj") { state.liveDeck = true; renderLiveMini(); renderSubjectDeck(); }
    if (nav === "note") openAdvisorCompose(code, date);
  };
}

function injectAdvisorNoteBtn(code, date) {
  bindLiveDock(code, date);
  const old = document.getElementById("adv-note-btn");
  if (old) old.remove();
}

function unreadAdvisorCount() {
  const seen = state.inboxSeenAt || 0;
  return (state.advisorInbox || []).filter((n) => (n.at || 0) > seen).length;
}
function advisorChipHtml() {
  const n = unreadAdvisorCount();
  const online = state.advisorPresence && (Date.now() - (state.advisorPresence.at || 0) < 120000);
  return `<button type="button" class="advisor-chip" data-advisor>
    <span>مشاور${online ? " · آنلاین" : ""}</span>
    ${n > 0 ? `<span class="bell" title="پیام جدید">🔔<i>${n > 9 ? "9+" : n}</i></span>` : ""}
  </button>`;
}
function updateAdvisorBell() {
  const chip = document.querySelector(".advisor-chip");
  if (!chip) return;
  const n = unreadAdvisorCount();
  let bell = chip.querySelector(".bell");
  if (n > 0) {
    if (!bell) {
      bell = document.createElement("span");
      bell.className = "bell";
      chip.appendChild(bell);
    }
    bell.innerHTML = `🔔<i>${n > 9 ? "9+" : n}</i>`;
  } else if (bell) {
    bell.remove();
  }
  // dock badge
  const dockBtn = document.querySelector('[data-nav="advisor"]');
  if (dockBtn) {
    dockBtn.classList.toggle("has-badge", n > 0);
    let b = dockBtn.querySelector(".dock-badge");
    if (n > 0) {
      if (!b) { b = document.createElement("span"); b.className = "dock-badge"; dockBtn.appendChild(b); }
      b.textContent = n > 9 ? "9+" : String(n);
    } else if (b) b.remove();
  }
}
async function openAdvisor() {
  if (state.readonly) return;
  // try fresh pull
  try {
    if (navigator.onLine && state.syncCode && sync.hasConfig(state.firebase)) {
      await sync.initSync(state.firebase);
      const code = (state.syncCode || "").toUpperCase();
      const list = await sync.fetchInbox(code);
      state.advisorInbox = Array.isArray(list) ? list : [];
      await db.kvSet("advisorInboxCache", state.advisorInbox);
      await sync.subscribeInbox(code, async (list2) => {
        state.advisorInbox = list2 || [];
        await db.kvSet("advisorInboxCache", state.advisorInbox);
        updateAdvisorBell();
      });
    } else {
      const cached = await db.kvGet("advisorInboxCache");
      if (Array.isArray(cached)) state.advisorInbox = cached;
    }
  } catch (e) { console.warn(e); }
  const pres = state.advisorPresence;
  const last = pres?.at ? new Date(pres.at).toLocaleString("fa-IR") : "—";
  const online = pres && (Date.now() - (pres.at || 0) < 120000);
  const notes = (state.advisorInbox || []).map((n) => {
    const unread = (n.at || 0) > (state.inboxSeenAt || 0);
    const audio = n.voice
      ? `<audio controls preload="metadata" style="width:100%;margin-top:8px" src="data:${n.voiceMime || "audio/webm"};base64,${n.voice}"></audio>`
      : "";
    return `<div class="note-card ${unread ? "unread" : ""}"><div class="sess-row"><span>${escapeHtml(n.from || "مشاور")}</span><span>${n.at ? new Date(n.at).toLocaleString("fa-IR") : ""}</span></div><p>${escapeHtml(n.text || "")}</p>${audio}</div>`;
  }).join("") || `<p style="color:#666">یادداشتی نیست</p>`;
  openSheet(`<h3>مشاور</h3>
    <p style="color:${online ? "#3dd68c" : "#aaa"}">${online ? "● آنلاین / در حال مشاهده" : "○ آفلاین"}</p>
    <p style="color:#aaa;font-size:.8rem">آخرین بازدید: ${last}</p>
    <h4 style="margin-top:12px">صندوق یادداشت‌ها</h4>
    ${notes}
    <button class="ghost" data-close>بستن</button>`);
  // mark as seen
  const maxAt = (state.advisorInbox || []).reduce((m, n) => Math.max(m, n.at || 0), 0);
  if (maxAt > (state.inboxSeenAt || 0)) {
    state.inboxSeenAt = maxAt;
    db.kvSet("inboxSeenAt", state.inboxSeenAt);
    updateAdvisorBell();
    const chip = document.querySelector(".advisor-chip");
    if (chip) chip.outerHTML = advisorChipHtml();
  }
}

function openExamHub() {
  if (state.readonly) return;
  const list = (state.exams || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const manuals = list.filter((e) => e.kind === "manual");
  const sheets = list.filter((e) => e.kind !== "manual");
  openSheet(`<div class="exam-hub">
    <h3>آزمون‌ها</h3>
    <p class="hint">پاسخنامه چهارگزینه‌ای و کارنامه دستی درس‌به‌درس — کاملاً جدا از آمار مطالعه</p>
    <button class="primary btn-block" id="newEx">＋ پاسخنامه جدید</button>
    <button class="ghost btn-block" id="newMan">＋ کارنامه دستی (درس‌ها)</button>
    <h4 style="margin-top:14px">پاسخنامه‌ها</h4>
    <div class="exam-list">${sheets.length ? sheets.map((ex) => `
      <div class="exam-card" data-ex="${ex.id}">
        <div class="exam-card-top">
          <b>${escapeHtml(ex.title)}</b>
          <span class="tag ${ex.status === "graded" ? "ok" : "draft"}">${ex.status === "graded" ? "تصحیح‌شده" : "پیش‌نویس"}</span>
        </div>
        <div class="exam-card-meta">${ex.subject ? escapeHtml(ex.subject) + " · " : ""}سوال ${dig(ex.from)}–${dig(ex.to)} · ${dig(ex.questions?.length || 0)} تست</div>
        ${ex.result ? `<div class="exam-card-score">${dig(ex.result.pctNeg)}٪</div>` : ""}
        <div class="exam-card-actions">
          <button class="ghost sm" data-open-ex="${ex.id}">باز کردن</button>
          <button class="danger sm" data-del-ex="${ex.id}">حذف</button>
        </div>
      </div>`).join("") : `<p class="hint">پاسخنامه‌ای نیست</p>`}</div>
    <h4 style="margin-top:14px">کارنامه‌های دستی</h4>
    <div class="exam-list">${manuals.length ? manuals.map((ex) => `
      <div class="exam-card">
        <div class="exam-card-top"><b>${escapeHtml(ex.title)}</b><span class="tag ok">دستی</span></div>
        <div class="exam-card-meta">${formatShort(ex.examDate || "")} · ${dig((ex.subjects||[]).length)} درس</div>
        <div class="exam-card-actions">
          <button class="ghost sm" data-open-man="${ex.id}">باز کردن</button>
          <button class="ghost sm" data-cmp-man="${ex.id}">مقایسه با روز</button>
          <button class="danger sm" data-del-ex="${ex.id}">حذف</button>
        </div>
      </div>`).join("") : `<p class="hint">کارنامه دستی نیست</p>`}</div>
    <button class="ghost btn-block" data-close>بستن</button>
  </div>`);
  sheet.querySelector("#newEx").onclick = () => openNewExam();
  sheet.querySelector("#newMan").onclick = () => openNewManualExam();
  sheet.querySelectorAll("[data-open-ex]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openExam(b.dataset.openEx); });
  sheet.querySelectorAll("[data-open-man]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openManualExam(b.dataset.openMan); });
  sheet.querySelectorAll("[data-cmp-man]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openManualExamCompare(b.dataset.cmpMan); });
  sheet.querySelectorAll("[data-del-ex]").forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm("این آزمون حذف شود؟")) return;
    const id = b.dataset.delEx;
    await db.del("exams", id);
    state.exams = state.exams.filter((x) => x.id !== id);
    openExamHub();
  });
}
function openNewExam() {
  openSheet(`<div class="exam-hub">
    <h3>آزمون جدید</h3>
    <div class="field"><label>عنوان</label><input id="title" placeholder="مثلاً زیست جامع قلم‌چی"></div>
    <div class="field"><label>درس (اختیاری)</label><input id="subj" placeholder="زیست"></div>
    <div class="field-row">
      <div class="field"><label>از شماره</label><input id="from" type="number" value="1" min="1"></div>
      <div class="field"><label>تا شماره</label><input id="to" type="number" value="50" min="1"></div>
    </div>
    <div class="field"><label>شماره سوال‌ها</label>
      <select id="parity">
        <option value="all">همه (۱ تا n)</option>
        <option value="odd">فقط مضارب فرد (۱،۳،۵…)</option>
        <option value="even">فقط مضارب زوج (۲،۴،۶…)</option>
      </select>
    </div>
    <div class="field"><label><input type="checkbox" id="neg" checked> نمره منفی در کارنامه</label></div>
    <button class="primary btn-block" id="ok">ساخت پاسخنامه</button>
    <button class="ghost btn-block" id="back">بازگشت</button>
  </div>`);
  sheet.querySelector("#back").onclick = openExamHub;
  sheet.querySelector("#ok").onclick = async () => {
    const ex = examMod.createExam({
      title: sheet.querySelector("#title").value.trim(),
      subject: sheet.querySelector("#subj").value.trim(),
      from: sheet.querySelector("#from").value,
      to: sheet.querySelector("#to").value,
      parity: sheet.querySelector("#parity").value,
      negative: sheet.querySelector("#neg").checked
    });
    state.exams.push(ex);
    await db.put("exams", ex);
    openExam(ex.id);
  };
}

async function openExam(id) {
  let ex = state.exams.find((e) => e.id === id) || await db.get("exams", id);
  if (!ex) return;
  const paint = () => {
    const answered = ex.questions.filter((q) => q.answer).length;
    const rows = ex.questions.map((q, i) => {
      const det = ex.result ? ex.result.detail.find((x) => x.n === q.n) : null;
      const statusCls = det ? (det.status === "ok" ? "is-ok" : det.status === "bad" ? "is-bad" : "is-blank") : "";
      const choices = ["1", "2", "3", "4"].map((c) => {
        let extra = q.answer === c ? " on" : "";
        if (det && q.answer === c) extra += " " + statusCls;
        if (det && String(det.key) === c && det.status === "bad") extra += " was-key";
        return `<button type="button" class="choice${extra}" data-i="${i}" data-c="${c}">${dig(c)}</button>`;
      }).join("");
      let mark = "";
      if (det) mark = `<span class="mark ${det.status}">${det.status === "ok" ? "✓" : det.status === "bad" ? "✕" : "—"}</span>`;
      return `<div class="exam-q"><span class="qn">${dig(q.n)}</span><div class="choices">${choices}</div>${mark}</div>`;
    }).join("");
    const res = ex.result ? `<div class="exam-result">
      <div class="er-title">کارنامه</div>
      <div class="er-grid">
        <div><b>${dig(ex.result.correct)}</b><span>صحیح</span></div>
        <div><b>${dig(ex.result.wrong)}</b><span>غلط</span></div>
        <div><b>${dig(ex.result.blank)}</b><span>نزده</span></div>
        <div><b>${dig(ex.result.pctRaw)}٪</b><span>خام</span></div>
        <div class="span2"><b>${dig(ex.result.pctNeg)}٪</b><span>${ex.result.negative !== false ? "با نمره منفی" : "نهایی"}</span></div>
      </div>
    </div>` : "";
    openSheet(`<div class="exam-hub">
      <div class="exam-head">
        <div>
          <h3>${escapeHtml(ex.title)}</h3>
          <p class="hint">${ex.subject ? escapeHtml(ex.subject) + " · " : ""}${examMod.parityLabel(ex.parity || "all")} · ${dig(answered)}/${dig(ex.questions.length)} پاسخ</p>
        </div>
      </div>
      <div class="exam-sheet">${rows}</div>
      ${res}
      <div class="exam-toolbar">
        <button class="ghost" id="saveEx">ذخیره</button>
        ${ex.result ? "" : `<button class="primary" id="grade">تصحیح</button>`}
        <button class="ghost" id="shareEx">اشتراک</button>
        <button class="danger" id="delEx">حذف</button>
        <button class="ghost" id="backHub">فهرست</button>
      </div>
    </div>`);
    sheet.querySelectorAll(".choice").forEach((b) => {
      b.onclick = () => {
        if (ex.result) return;
        const i = Number(b.dataset.i);
        const c = b.dataset.c;
        ex = examMod.setAnswer(ex, i, c);
        const ix = state.exams.findIndex((e) => e.id === ex.id);
        if (ix >= 0) state.exams[ix] = ex;
        // update only this row — keep scroll position
        const row = b.closest(".exam-q");
        if (row) {
          row.querySelectorAll(".choice").forEach((ch) => {
            ch.classList.toggle("on", ch.dataset.c === ex.questions[i].answer);
          });
        }
        const head = sheet.querySelector(".exam-head .hint");
        if (head) {
          const answered = ex.questions.filter((q) => q.answer).length;
          const sub = ex.subject ? escapeHtml(ex.subject) + " · " : "";
          head.innerHTML = `${sub}${examMod.parityLabel(ex.parity || "all")} · ${dig(answered)}/${dig(ex.questions.length)} پاسخ`;
        }
      };
    });
    sheet.querySelector("#saveEx").onclick = async () => {
      ex.updatedAt = Date.now();
      await db.put("exams", ex);
      const ix = state.exams.findIndex((e) => e.id === ex.id);
      if (ix >= 0) state.exams[ix] = ex;
      alert("ذخیره شد");
    };
    sheet.querySelector("#backHub").onclick = openExamHub;
    sheet.querySelector("#delEx").onclick = async () => {
      if (!confirm("حذف این آزمون؟")) return;
      await db.del("exams", ex.id);
      state.exams = state.exams.filter((x) => x.id !== ex.id);
      openExamHub();
    };
    const g = sheet.querySelector("#grade");
    if (g) g.onclick = () => {
      openSheet(`<div class="exam-hub">
        <h3>کلید پاسخنامه</h3>
        <p class="hint">فقط اعداد ۱ تا ۴ به ترتیب سوال‌ها — بدون شماره سوال<br>مثال برای ۵ سوال: <code>31421</code></p>
        <div class="field"><textarea id="key" rows="3" placeholder="مثلاً 24132143..." inputmode="numeric"></textarea></div>
        <button class="primary btn-block" id="ok">تصحیح و کارنامه</button>
        <button class="ghost btn-block" id="back">بازگشت</button>
      </div>`);
      sheet.querySelector("#back").onclick = () => openExam(ex.id);
      sheet.querySelector("#ok").onclick = async () => {
        const map = examMod.parseKey(sheet.querySelector("#key").value, ex);
        if (!map) return alert("کلید نامعتبر — فقط ارقام ۱ تا ۴");
        if (Object.keys(map).length < ex.questions.length) {
          if (!confirm(`کلید کوتاه‌تر از تعداد سوال است (${Object.keys(map).length}/${ex.questions.length}). ادامه؟`)) return;
        }
        ex.result = examMod.gradeExam(ex, map);
        ex.status = "graded";
        ex.updatedAt = Date.now();
        await db.put("exams", ex);
        const ix = state.exams.findIndex((e) => e.id === ex.id);
        if (ix >= 0) state.exams[ix] = ex;
        openExam(ex.id);
      };
    };
    sheet.querySelector("#shareEx").onclick = async () => {
      openSheet(`<h3>اشتراک کارنامه</h3>
        <button class="primary btn-block" id="shTxt">متن</button>
        <button class="ghost btn-block" id="shImg">تصویر PNG</button>
        <button class="ghost btn-block" data-close>بستن</button>`);
      sheet.querySelector("#shTxt").onclick = async () => {
        const text = examMod.examShareText(ex);
        try { await navigator.clipboard.writeText(text); alert("کپی شد"); } catch { prompt("کارنامه", text); }
      };
      sheet.querySelector("#shImg").onclick = async () => {
        const c = document.createElement("canvas");
        c.width = 900; c.height = 1200;
        const g = c.getContext("2d");
        g.fillStyle = "#0a0a0c"; g.fillRect(0, 0, 900, 1200);
        g.fillStyle = "#E6A817"; g.font = "700 36px Tahoma"; g.textAlign = "center";
        g.fillText(ex.title, 450, 70);
        g.fillStyle = "#aaa"; g.font = "400 20px Tahoma";
        g.fillText(examMod.examShareText(ex).split("\n").slice(1).join(" | "), 450, 110);
        let y = 160;
        (ex.result?.detail || []).forEach((d) => {
          g.fillStyle = d.status === "ok" ? "#3dd68c" : d.status === "bad" ? "#ff5d5d" : "#888";
          g.font = "600 22px Tahoma"; g.textAlign = "right";
          g.fillText(`${d.n}) ${d.ans || "—"}  کلید:${d.key || "—"}`, 850, y);
          y += 28;
          if (y > 1150) return;
        });
        if (ex.result) {
          g.fillStyle = "#fff"; g.font = "700 28px Tahoma"; g.textAlign = "center";
          g.fillText(`${ex.result.pctNeg}%`, 450, 1180);
        }
        c.toBlob(async (blob) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `exam-${ex.id}.png`;
          a.click();
        }, "image/png");
      };
    };
  };
  paint();
}



function openNewManualExam() {
  const cats = state.catalog || [];
  openSheet(`<h3>کارنامه دستی</h3>
    <div class="field"><label>نام آزمون</label><input id="mt" placeholder="مثلاً آزمون X قلم‌چی"></div>
    <div class="field"><label>تاریخ آزمون</label><input id="md" type="text" value="${state.today}" placeholder="YYYY-MM-DD شمسی"></div>
    <p class="hint">برای هر درس تعداد درست / غلط / نزده را وارد کن</p>
    <div class="manual-subs">${cats.map((c) => `
      <div class="manual-row" data-sid="${c.id}">
        <b style="color:${c.color}">${escapeHtml(c.name)}</b>
        <label><input type="checkbox" data-use> فعال</label>
        <input type="number" min="0" data-c placeholder="درست" value="0">
        <input type="number" min="0" data-w placeholder="غلط" value="0">
        <input type="number" min="0" data-b placeholder="نزده" value="0">
      </div>`).join("")}</div>
    <button class="primary btn-block" id="ok">ذخیره</button>
    <button class="ghost btn-block" id="back">بازگشت</button>`);
  sheet.querySelector("#back").onclick = openExamHub;
  sheet.querySelector("#ok").onclick = async () => {
    const title = sheet.querySelector("#mt").value.trim() || "آزمون دستی";
    const examDate = sheet.querySelector("#md").value.trim() || state.today;
    const subjects = [];
    sheet.querySelectorAll(".manual-row").forEach((row) => {
      if (!row.querySelector("[data-use]").checked) return;
      const c = Number(row.querySelector("[data-c]").value) || 0;
      const w = Number(row.querySelector("[data-w]").value) || 0;
      const b = Number(row.querySelector("[data-b]").value) || 0;
      const total = c + w + b;
      const pct = total ? Math.round((c / total) * 1000) / 10 : 0;
      const pctNeg = total ? Math.round(((c * 3 - w) / (total * 3)) * 1000) / 10 : 0;
      const cat = state.catalog.find((x) => x.id === row.dataset.sid);
      subjects.push({ id: row.dataset.sid, name: cat?.name || "", color: cat?.color || GOLD, correct: c, wrong: w, blank: b, total, pct, pctNeg });
    });
    if (!subjects.length) return alert("حداقل یک درس را فعال کن");
    const ex = { id: uid(), kind: "manual", title, examDate, subjects, status: "graded", updatedAt: Date.now(), createdAt: Date.now() };
    await db.put("exams", ex);
    state.exams = [ex, ...(state.exams || []).filter((e) => e.id !== ex.id)];
    openManualExam(ex.id);
  };
}
function openManualExam(id) {
  const ex = (state.exams || []).find((e) => e.id === id);
  if (!ex) return openExamHub();
  openSheet(`<h3>${escapeHtml(ex.title)}</h3>
    <p class="hint">${formatShort(ex.examDate || "")}</p>
    <div class="exam-list">${(ex.subjects || []).map((s) => `
      <div class="exam-card">
        <div class="exam-card-top"><b style="color:${s.color}">${escapeHtml(s.name)}</b><span class="tag ok">${dig(s.pct)}٪</span></div>
        <div class="exam-card-meta">درست ${dig(s.correct)} · غلط ${dig(s.wrong)} · نزده ${dig(s.blank)} · منفی ${dig(s.pctNeg)}٪</div>
      </div>`).join("")}</div>
    <button class="primary btn-block" data-cmp>مقایسه درصد با یک روز</button>
    <button class="ghost btn-block" id="back">بازگشت</button>`);
  sheet.querySelector("#back").onclick = openExamHub;
  sheet.querySelector("[data-cmp]").onclick = () => openManualExamCompare(id);
}
async function openManualExamCompare(id) {
  const ex = (state.exams || []).find((e) => e.id === id);
  if (!ex) return;
  const days = (await db.all("days")).slice().sort((a, b) => compareKeys(b.date, a.date));
  openSheet(`<h3>مقایسه «${escapeHtml(ex.title)}»</h3>
    <div class="field"><label>روز مطالعه</label>
      <select id="cd">${days.map((d) => `<option value="${d.date}">${formatShort(d.date)}</option>`).join("")}</select>
    </div>
    <button class="primary btn-block" id="go">رسم نمودار</button>
    <div id="mchart" class="chart-host" style="margin-top:12px"></div>
    <button class="ghost btn-block" id="back">بازگشت</button>`);
  sheet.querySelector("#back").onclick = () => openManualExam(id);
  sheet.querySelector("#go").onclick = async () => {
    const key = sheet.querySelector("#cd").value;
    const day = (await db.all("days")).find((d) => d.date === key);
    const pointsExam = (ex.subjects || []).map((s) => ({ date: s.name, value: s.pct || 0 }));
    const pointsDay = (ex.subjects || []).map((s) => {
      const ds = day?.subjects?.[s.id];
      const c = ds?.correct || 0, w = ds?.wrong || 0, b = ds?.blank || 0;
      const t = c + w + b;
      return { date: s.name, value: t ? Math.round((c / t) * 1000) / 10 : 0 };
    });
    // dual series: draw exam pct as main chart
    lineChart(sheet.querySelector("#mchart"), pointsExam, GOLD, (sum) => `میانگین آزمون ${dig(Math.round((sum / Math.max(1, pointsExam.length)) * 10) / 10)}٪`);
    const cap = document.createElement("div");
    cap.className = "chart-cap";
    const avgDay = pointsDay.reduce((a, p) => a + p.value, 0) / Math.max(1, pointsDay.length);
    const avgEx = pointsExam.reduce((a, p) => a + p.value, 0) / Math.max(1, pointsExam.length);
    cap.innerHTML = `روز ${formatShort(key)} میانگین ${dig(Math.round(avgDay * 10) / 10)}٪ · آزمون ${dig(Math.round(avgEx * 10) / 10)}٪<br>` +
      pointsExam.map((p, i) => `${escapeHtml(p.date)}: آزمون ${dig(p.value)}٪ / روز ${dig(pointsDay[i].value)}٪`).join("<br>");
    sheet.querySelector("#mchart").appendChild(cap);
  };
}

function openBadgeEditor() {
  if (state.readonly || state.liveMode) return;
  const has = !!(state.day && state.day.badge);
  openSheet(`<h3>نشان بالای پنل</h3>
    <p class="hint">فقط برای <b>همین روز</b> ذخیره می‌شود. روزهای قبل عوض نمی‌شوند.</p>
    ${has ? `<div style="text-align:center;margin:8px 0"><img src="${state.day.badge}" alt="" style="max-height:72px;border-radius:12px"></div>` : ""}
    <div class="btn-grid-2">
      <button class="ghost" id="up">آپلود عکس/فیلم</button>
      <button class="danger" id="rm" ${has ? "" : "disabled"}>حذف</button>
    </div>
    <input id="bf" type="file" accept="image/*,video/*" hidden>
    <button class="ghost btn-block" data-close>بستن</button>`);
  sheet.querySelector("#up").onclick = () => sheet.querySelector("#bf").click();
  sheet.querySelector("#bf").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    let dataUrl;
    if (f.type.startsWith("image/")) {
      dataUrl = await compressImageForSync(f);
    } else {
      // video: keep if small, else warn
      if (f.size > 450000) {
        alert("ویدیو برای همگام‌سازی خیلی بزرگ است. عکس کوچک‌تر آپلود کن یا ویدیوی کوتاه‌تر.");
        return;
      }
      dataUrl = await fileToDataUrl(f);
    }
    state.day.badge = dataUrl;
    state.day.badgeType = f.type.startsWith("video") ? "video" : "image";
    await saveDay();
    closeSheet(); render();
  };
  sheet.querySelector("#rm").onclick = async () => {
    state.day.badge = "";
    state.day.badgeType = "";
    await saveDay();
    closeSheet(); render();
  };
}
async function compressImageForSync(file, maxW = 360, quality = 0.7) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxW / Math.max(bmp.width, 1));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    let q = quality;
    let url = canvas.toDataURL("image/jpeg", q);
    // shrink until under ~180KB data URL
    while (url.length > 180000 && q > 0.35) {
      q -= 0.1;
      url = canvas.toDataURL("image/jpeg", q);
    }
    return url;
  } catch {
    return fileToDataUrl(file);
  }
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function initRipple() {
  if (window.__rippleBound) return;
  window.__rippleBound = true;
  const fire = (e) => {
    if (state.settings.ripple === false) return;
    const btn = e.target.closest("button, .choice, .subject-name, .advisor-chip, .dq, .mini-btn, .todo-chip, .cwb-btn");
    if (!btn || btn.disabled) return;
    const color = state.settings.rippleColor || "#E6A817";
    const rect = btn.getBoundingClientRect();
    let x = rect.width / 2, y = rect.height / 2;
    if (e.clientX != null) { x = e.clientX - rect.left; y = e.clientY - rect.top; }
    const prev = getComputedStyle(btn).position;
    if (prev === "static") btn.style.position = "relative";
    btn.classList.add("rippling");
    // outer halo (must not be clipped)
    const halo = document.createElement("span");
    halo.className = "ripple-halo";
    halo.style.setProperty("--rc", color);
    btn.appendChild(halo);
    // inner ink
    const ink = document.createElement("span");
    ink.className = "ripple-ink";
    const size = Math.max(rect.width, rect.height) * 2.4;
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = (x - size / 2) + "px";
    ink.style.top = (y - size / 2) + "px";
    ink.style.background = color;
    btn.appendChild(ink);
    setTimeout(() => {
      ink.remove(); halo.remove();
      btn.classList.remove("rippling");
    }, 650);
  };
  document.addEventListener("pointerdown", fire, { passive: true });
  document.addEventListener("touchstart", fire, { passive: true });
  document.documentElement.style.setProperty("--ripple", state.settings.rippleColor || "#E6A817");
}
async function loadStoredFonts() {
  try {
    const t = await db.blobGet("fontTimer");
    if (t && t.size > 50) {
      const url = URL.createObjectURL(t);
      const face = new FontFace("TimerCustom", `url(${url})`);
      await face.load(); document.fonts.add(face);
    }
  } catch {}
  try {
    const a = await db.blobGet("fontApp");
    if (a && a.size > 50) {
      const url = URL.createObjectURL(a);
      const face = new FontFace("AppCustom", `url(${url})`);
      await face.load(); document.fonts.add(face);
    }
  } catch {}
}
function applyFonts() {
  const appF = state.settings.appFont || "system";
  const timF = state.settings.timerFont || "system";
  document.documentElement.dataset.appFont = appF;
  document.documentElement.dataset.timerFont = timF;
  document.body.classList.remove("font-system", "font-vazir", "font-mono", "font-rounded", "font-custom-app");
  document.body.classList.add("font-" + (appF === "custom" ? "custom-app" : appF));
}
async function applyCustomIcon() {
  try {
    const blob = await db.blobGet("appIcon");
    const links = [
      document.getElementById("app-icon"),
      document.getElementById("app-icon-512"),
      document.getElementById("app-apple-icon")
    ].filter(Boolean);
    if (blob && blob.size > 100) {
      const url = URL.createObjectURL(blob);
      links.forEach((l) => { l.href = url; });
    } else {
      links.forEach((l) => {
        if (l.id === "app-icon-512") l.href = "./icon-512.png";
        else l.href = "./icon-192.png";
      });
    }
  } catch {}
}

function setupSeamlessVideo(video) {
  if (!video || video.dataset.seamless === "1") return;
  video.dataset.seamless = "1";
  video.muted = true;
  video.playsInline = true;
  video.loop = false; // manual seamless loop
  const restart = () => {
    try {
      if (video.currentTime > 0 && video.duration && !isNaN(video.duration)) {
        // seek slightly before end handled in timeupdate
      }
      video.currentTime = 0.001;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  };
  video.addEventListener("timeupdate", () => {
    if (!video.duration || isNaN(video.duration)) return;
    if (video.currentTime >= video.duration - 0.12) {
      video.currentTime = 0.05;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }
  });
  video.addEventListener("ended", restart);
  video.addEventListener("loadeddata", () => {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  });
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

const BOOT_WATCHDOG = setTimeout(() => {
  if (appEl && /بارگذاری/.test(appEl.textContent || "")) {
    appEl.innerHTML = `<div style="color:#fff;padding:20px;line-height:1.7">
      <p><b>بارگذاری طولانی شد.</b></p>
      <p style="color:#aaa;font-size:.85rem">کش قدیمی احتمالاً مشکل دارد.</p>
      <button id="bustCache" style="margin-top:12px;padding:10px 16px;border-radius:12px;border:0;background:#E6A817;color:#000;font-weight:700">پاک‌سازی کش و رفرش</button>
    </div>`;
    document.getElementById("bustCache")?.addEventListener("click", async () => {
      try {
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        for (const r of regs) await r.unregister();
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      } catch {}
      location.reload(true);
    });
  }
}, 9000);

boot().then(() => clearTimeout(BOOT_WATCHDOG)).catch((err) => {
  clearTimeout(BOOT_WATCHDOG);
  console.error(err);
  appEl.innerHTML = `<p style="color:#fff;background:#3a1010;padding:12px;border-radius:12px;margin:16px">خطا در شروع: ${err && err.message ? err.message : err}</p>
    <button onclick="location.reload()" style="margin:12px;padding:10px 14px;border-radius:10px;border:0;background:#E6A817">تلاش دوباره</button>`;
});
