/** Firebase Realtime sync — offline-first, multi-device. Fast path: modules cached. */

let app = null;
let dbRef = null;
let unsub = null;
let liveUnsub = null;
let inboxUnsub = null;
let lastNoteUnsub = null;
let fbMods = null; // cached firebase modules

export function hasConfig(cfg) {
  return !!(cfg && cfg.apiKey && cfg.databaseURL && cfg.projectId);
}

async function loadMods() {
  if (fbMods) return fbMods;
  const appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
  const dbMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js");
  fbMods = { ...appMod, ...dbMod };
  return fbMods;
}

export async function initSync(cfg) {
  if (!hasConfig(cfg)) { app = null; dbRef = null; return false; }
  try {
    const { initializeApp, getApps, getDatabase } = await loadMods();
    const apps = getApps();
    app = apps.length ? apps[0] : initializeApp(cfg);
    dbRef = getDatabase(app);
    return true;
  } catch (e) {
    console.warn("Firebase init failed", e);
    app = null; dbRef = null;
    return false;
  }
}

function codePath(syncCode) {
  return "rooms/" + String(syncCode || "").trim().toUpperCase();
}

export async function pushBundle(syncCode, bundle) {
  if (!dbRef || !syncCode) return false;
  try {
    const { ref, set } = await loadMods();
    const b = { ...bundle, pushedAt: Date.now() };
    // shrink days badges for multi-device reliability
    if (Array.isArray(b.days)) {
      b.days = b.days.map((d) => {
        if (!d || !d.badge) return d;
        if (String(d.badge).length > 200000) return { ...d, badge: null, badgeType: null, _badgeSkipped: true };
        return d;
      });
    }
    await set(ref(dbRef, codePath(syncCode) + "/bundle"), b);
    return true;
  } catch (e) {
    console.warn("push failed", e);
    return false;
  }
}

export async function pullBundle(syncCode) {
  if (!dbRef || !syncCode) return null;
  try {
    const { ref, get } = await loadMods();
    const snap = await get(ref(dbRef, codePath(syncCode) + "/bundle"));
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.warn("pull failed", e);
    return null;
  }
}

export async function subscribeBundle(syncCode, onData) {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
  if (!dbRef || !syncCode) return;
  const { ref, onValue, off } = await loadMods();
  const r = ref(dbRef, codePath(syncCode) + "/bundle");
  const handler = (snap) => { if (snap.exists()) onData(snap.val()); };
  onValue(r, handler);
  unsub = () => off(r, "value", handler);
}

function sanitizeForLive(obj) {
  if (obj == null) return obj;
  try {
    const s = JSON.stringify(obj);
    // RTDB soft limit — strip huge badge/media
    if (s.length > 900000) {
      const copy = JSON.parse(s);
      if (copy.badge) { copy.badge = null; copy.badgeType = null; copy._badgeSkipped = true; }
      if (copy.day && copy.day.badge) { copy.day.badge = null; copy.day.badgeType = null; copy.day._badgeSkipped = true; }
      return copy;
    }
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Fast path: only timer node — used on pause/stop so clear always arrives */
export async function pushLiveTimer(syncCode, date, timer) {
  if (!dbRef || !syncCode || !date) return false;
  try {
    const { ref, set, update } = await loadMods();
    const path = codePath(syncCode) + "/live/" + date;
    const t = (!timer || !timer.status || timer.status === "finished")
      ? { status: "off", at: Date.now() }
      : JSON.parse(JSON.stringify(timer));
    await set(ref(dbRef, path + "/timer"), t);
    await update(ref(dbRef, path), { timer: t, pushedAt: Date.now(), updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn("timer push failed", e);
    try {
      const { ref, set } = await loadMods();
      const path = codePath(syncCode) + "/live/" + date;
      const t = { status: "off", at: Date.now() };
      await set(ref(dbRef, path + "/timer"), t);
      return true;
    } catch (e2) {
      console.warn("timer push retry failed", e2);
      return false;
    }
  }
}

export async function pushLiveDay(syncCode, date, payload) {
  if (!dbRef || !syncCode || !date) return false;
  const path = codePath(syncCode) + "/live/" + date;
  const tryOnce = async () => {
    const { ref, update, set } = await loadMods();
    let day = payload.day ? sanitizeForLive(payload.day) : null;
    if (day && day.badge && String(day.badge).length > 250000) {
      day = { ...day, badge: null, badgeType: null, _badgeSkipped: true };
    }
    // ALWAYS send timer key so remote can clear (use status "off")
    let timer = payload.timer;
    if (!timer || !timer.status || timer.status === "finished") {
      timer = { status: "off", at: Date.now() };
    } else {
      timer = sanitizeForLive(timer);
    }
    const updates = {
      day,
      timer,
      liveOk: true,
      updatedAt: Date.now(),
      pushedAt: payload.pushedAt || Date.now()
    };
    if (payload.days) {
      // strip badges from history to keep size down
      updates.days = (payload.days || []).map((d) => {
        if (!d) return d;
        const x = { ...d };
        if (x.badge && String(x.badge).length > 2000) { x.badge = null; x.badgeType = null; }
        return x;
      });
    }
    if (payload.catalog) updates.catalog = payload.catalog;
    if (payload.notes) updates.notes = payload.notes;
    const clean = sanitizeForLive(updates) || updates;
    await update(ref(dbRef, path), clean);
    // dedicated timer node — always wins for pause/stop
    await set(ref(dbRef, path + "/timer"), timer);
    // badge may be large — write as its own leaf so rest of day still syncs
    if (day && day.badge && String(day.badge).length <= 250000) {
      try {
        await set(ref(dbRef, path + "/day/badge"), day.badge);
        await set(ref(dbRef, path + "/day/badgeType"), day.badgeType || "image");
      } catch (be) { console.warn("badge push skip", be); }
    } else if (day && day._badgeSkipped) {
      try {
        await set(ref(dbRef, path + "/day/badge"), null);
        await set(ref(dbRef, path + "/day/badgeType"), null);
      } catch {}
    }
    return true;
  };
  try {
    return await tryOnce();
  } catch (e1) {
    console.warn("live push failed, retry", e1);
    try {
      await new Promise((r) => setTimeout(r, 400));
      return await tryOnce();
    } catch (e2) {
      console.warn("live push failed twice", e2);
      return false;
    }
  }
}

export async function subscribeLiveDay(syncCode, date, onData) {
  if (liveUnsub) { try { liveUnsub(); } catch {} liveUnsub = null; }
  if (!dbRef || !syncCode || !date) return;
  const { ref, onValue, off, get } = await loadMods();
  const base = codePath(syncCode) + "/live/" + date;
  const r = ref(dbRef, base);
  const tr = ref(dbRef, base + "/timer");
  try {
    const snap = await get(r);
    if (snap.exists()) onData(snap.val());
  } catch {}
  const handler = (snap) => { if (snap.exists()) onData(snap.val()); };
  // timer-only updates (pause/stop) — merge into payload shape
  const timerHandler = (snap) => {
    const t = snap.exists() ? snap.val() : { status: "off" };
    onData({ timer: t, _timerOnly: true });
  };
  onValue(r, handler);
  onValue(tr, timerHandler);
  liveUnsub = () => {
    try { off(r, "value", handler); } catch {}
    try { off(tr, "value", timerHandler); } catch {}
  };
}

export async function pushAdvisorNote(syncCode, note) {
  if (!dbRef || !syncCode) return false;
  const code = String(syncCode).trim().toUpperCase();
  try {
    const { ref, set } = await loadMods();
    const id = "n" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const payload = {
      text: String(note.text || "").slice(0, 2000),
      from: note.from || "مشاور",
      date: note.date || "",
      at: Date.now()
    };
    if (note.voice) {
      payload.voice = note.voice;
      payload.voiceMime = note.voiceMime || "audio/webm";
    }
    // lastNote first = instant UI on student, inbox second
    await set(ref(dbRef, codePath(code) + "/lastNote"), { ...payload, id });
    set(ref(dbRef, codePath(code) + "/inbox/" + id), payload).catch(() => {});
    return true;
  } catch (e) {
    console.warn("note push failed", e);
    return false;
  }
}

export async function fetchInbox(syncCode) {
  if (!dbRef || !syncCode) return [];
  try {
    const { ref, get } = await loadMods();
    const snap = await get(ref(dbRef, codePath(syncCode) + "/inbox"));
    if (!snap.exists()) return [];
    const val = snap.val() || {};
    return Object.entries(val).map(([id, v]) => ({ id, ...(v || {}) })).sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch (e) {
    console.warn("fetch inbox failed", e);
    return [];
  }
}

export async function subscribeInbox(syncCode, onData) {
  if (inboxUnsub) { try { inboxUnsub(); } catch {} inboxUnsub = null; }
  if (!dbRef || !syncCode) return () => {};
  const { ref, onValue, off, get } = await loadMods();
  const r = ref(dbRef, codePath(syncCode) + "/inbox");
  try {
    const snap = await get(r);
    const val = snap.exists() ? (snap.val() || {}) : {};
    onData(Object.entries(val).map(([id, v]) => ({ id, ...(v || {}) })).sort((a, b) => (b.at || 0) - (a.at || 0)));
  } catch { onData([]); }
  const handler = (snap) => {
    const val = snap.val() || {};
    onData(Object.entries(val).map(([id, v]) => ({ id, ...(v || {}) })).sort((a, b) => (b.at || 0) - (a.at || 0)));
  };
  onValue(r, handler);
  inboxUnsub = () => off(r, "value", handler);
  return inboxUnsub;
}

/** Instant path: listen only to lastNote for near-realtime advisor messages */
export async function subscribeLastNote(syncCode, onNote) {
  if (lastNoteUnsub) { try { lastNoteUnsub(); } catch {} lastNoteUnsub = null; }
  if (!dbRef || !syncCode) return () => {};
  const { ref, onValue, off } = await loadMods();
  const r = ref(dbRef, codePath(syncCode) + "/lastNote");
  const handler = (snap) => {
    if (snap.exists()) onNote(snap.val());
  };
  onValue(r, handler);
  lastNoteUnsub = () => off(r, "value", handler);
  return lastNoteUnsub;
}

export async function setViewerPresence(syncCode, date, info) {
  if (!dbRef || !syncCode) return;
  try {
    const { ref, set } = await loadMods();
    await set(ref(dbRef, codePath(syncCode) + "/presence/" + date), { ...info, at: Date.now() });
  } catch {}
}

export async function subscribePresence(syncCode, date, onData) {
  if (!dbRef || !syncCode) return () => {};
  const { ref, onValue, off } = await loadMods();
  const r = ref(dbRef, codePath(syncCode) + "/presence/" + date);
  const handler = (snap) => { if (snap.exists()) onData(snap.val()); };
  onValue(r, handler);
  return () => off(r, "value", handler);
}

export async function setLiveMeta(syncCode, meta) {
  if (!dbRef || !syncCode) return false;
  try {
    const { ref, set } = await loadMods();
    await set(ref(dbRef, codePath(syncCode) + "/meta"), { ...meta, at: Date.now() });
    return true;
  } catch (e) { console.warn(e); return false; }
}

export async function getLiveMeta(syncCode) {
  if (!dbRef || !syncCode) return null;
  try {
    const { ref, get } = await loadMods();
    const snap = await get(ref(dbRef, codePath(syncCode) + "/meta"));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}

export async function revokeLive(syncCode, date) {
  if (!dbRef || !syncCode) return false;
  try {
    const { ref, set, remove } = await loadMods();
    await set(ref(dbRef, codePath(syncCode) + "/meta"), { revoked: true, revokedAt: Date.now(), revokedDate: date || "" });
    if (date) {
      try { await remove(ref(dbRef, codePath(syncCode) + "/live/" + date)); } catch {}
    }
    return true;
  } catch (e) { console.warn(e); return false; }
}

export async function publishCfg(syncCode, cfg) {
  if (!dbRef || !syncCode || !cfg) return false;
  try {
    const { ref, set } = await loadMods();
    await set(ref(dbRef, codePath(syncCode) + "/cfg"), {
      apiKey: cfg.apiKey,
      projectId: cfg.projectId,
      databaseURL: cfg.databaseURL,
      at: Date.now()
    });
    return true;
  } catch (e) { console.warn("publishCfg", e); return false; }
}

export async function fetchCfg(syncCode) {
  if (!dbRef || !syncCode) return null;
  try {
    const { ref, get } = await loadMods();
    const snap = await get(ref(dbRef, codePath(syncCode) + "/cfg"));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}

export function genSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
