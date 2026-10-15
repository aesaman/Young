const DB_NAME = "konkur-study-db";
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("subjects")) db.createObjectStore("subjects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("days")) db.createObjectStore("days", { keyPath: "date" });
      if (!db.objectStoreNames.contains("sessions")) {
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains("notes")) {
        const n = db.createObjectStore("notes", { keyPath: "id" });
        n.createIndex("subjectId", "subjectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("exams")) db.createObjectStore("exams", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
export function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("aborted"));
  });
}

export async function kvGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("kv").objectStore("kv").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function kvSet(key, value) {
  const d = await db();
  const tx = d.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await txDone(tx);
}

export async function put(store, value) {
  const d = await db();
  const tx = d.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function get(store, key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function del(store, key) {
  const d = await db();
  const tx = d.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function all(store) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function blobGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("blobs").objectStore("blobs").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function blobSet(key, value) {
  const d = await db();
  const tx = d.transaction("blobs", "readwrite");
  tx.objectStore("blobs").put(value, key);
  await txDone(tx);
}

export async function exportAll() {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    kv: {
      settings: await kvGet("settings"),
      activeTimer: await kvGet("activeTimer"),
      syncCode: await kvGet("syncCode"),
      firebase: await kvGet("firebase"),
      skyCity: await kvGet("skyCity"),
      weatherOn: await kvGet("weatherOn")
    },
    subjects: await all("subjects"),
    days: await all("days"),
    sessions: await all("sessions"),
    notes: await all("notes"),
    exams: await all("exams")
  };
}

export async function importAll(data) {
  if (!data || !Array.isArray(data.days)) throw new Error("invalid backup");
  const d = await db();
  const stores = ["kv", "subjects", "days", "sessions", "notes"];
  if (d.objectStoreNames.contains("exams")) stores.push("exams");
  const tx = d.transaction(stores, "readwrite");
  for (const s of stores) {
    if (s === "kv") tx.objectStore(s).clear();
    else tx.objectStore(s).clear();
  }
  (data.subjects || []).forEach((x) => tx.objectStore("subjects").put(x));
  (data.days || []).forEach((x) => tx.objectStore("days").put(x));
  (data.sessions || []).forEach((x) => tx.objectStore("sessions").put(x));
  (data.notes || []).forEach((x) => tx.objectStore("notes").put(x));
  if (stores.includes("exams")) (data.exams || []).forEach((x) => tx.objectStore("exams").put(x));
  const kv = data.kv || {};
  if (kv.settings) tx.objectStore("kv").put(kv.settings, "settings");
  if (kv.activeTimer) tx.objectStore("kv").put(kv.activeTimer, "activeTimer");
  if (kv.syncCode) tx.objectStore("kv").put(kv.syncCode, "syncCode");
  if (kv.firebase) tx.objectStore("kv").put(kv.firebase, "firebase");
  if (kv.skyCity) tx.objectStore("kv").put(kv.skyCity, "skyCity");
  if (kv.weatherOn != null) tx.objectStore("kv").put(kv.weatherOn, "weatherOn");
  await txDone(tx);
}
