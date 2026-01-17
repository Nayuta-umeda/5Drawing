// client/util.js
export function qs(name){ return new URLSearchParams(location.search).get(name); }
export function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

export function loadJson(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  }catch(e){ return fallback; }
}
export function saveJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix="w"){
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,6);
}

// ---- My Works (public snapshot + private local) ----
const KEY_WORKS = "anim5s_my_works_v15"; // meta list only

export function addPublicWork({ roomId, theme, thumbDataUrl, myFrameIndex = null }){
  const list = loadJson(KEY_WORKS, []);
  const id = uid("pub");
  list.unshift({
    id,
    kind:"public",
    roomId,
    theme: theme || "",
    at: Date.now(),
    thumb: thumbDataUrl || null,
    lastSyncAt: 0,
    filled: null,
    myFrameIndex: (Number.isFinite(Number(myFrameIndex)) ? Number(myFrameIndex) : null)
  });
  saveJson(KEY_WORKS, list.slice(0, 80));
  return id;
}

export function addPrivateWork({ theme }){
  const list = loadJson(KEY_WORKS, []);
  const id = uid("pri");
  list.unshift({
    id,
    kind:"private_local",
    roomId: "LOCAL-" + id.toUpperCase(),
    theme: theme || "",
    at: Date.now(),
    thumb: null
  });
  saveJson(KEY_WORKS, list.slice(0, 80));
  return id;
}

export function updateWorkMeta(id, patch){
  const list = loadJson(KEY_WORKS, []);
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  saveJson(KEY_WORKS, list);
}

export function deleteWorkMeta(id){
  const list = loadJson(KEY_WORKS, []);
  const next = list.filter(x => x.id !== id);
  saveJson(KEY_WORKS, next);
}

export function listWorks(){
  return loadJson(KEY_WORKS, []);
}

export function getWork(id){
  return listWorks().find(x => x.id === id) || null;
}


// ---- IndexedDB for public snapshot frames (manual update only) ----
export async function ensurePublicSnapshotFrames(roomId){
  const key = "pub:" + String(roomId || "");
  const existing = await idbGetWork(key);
  if (existing && Array.isArray(existing.frames) && existing.frames.length === 60) return existing.frames;
  const frames = Array.from({length:60}, () => null);
  await idbPutWork({ id: key, frames, updatedAt: Date.now() });
  return frames;
}
export async function savePublicSnapshotFrames(roomId, frames){
  const key = "pub:" + String(roomId || "");
  await idbPutWork({ id: key, frames, updatedAt: Date.now() });
}
export async function loadPublicSnapshotFrames(roomId){
  const key = "pub:" + String(roomId || "");
  const r = await idbGetWork(key);
  return r?.frames || null;
}

export async function deletePublicSnapshotFrames(roomId){
  const key = "pub:" + String(roomId || "");
  await idbDeleteWork(key);
}

// ---- IndexedDB for private frames ----
const DB_NAME = "anim5s_private_db_v1";
const STORE = "works";

// Cache the IndexedDB connection promise to avoid reopening for every operation.
let _dbPromise = null;
function openDb(){
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath:"id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the DB is upgraded in another tab, close and allow re-open.
      db.onversionchange = () => {
        try{ db.close(); }catch(e){}
        _dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      // Allow retry if open failed.
      _dbPromise = null;
      reject(req.error);
    };
  });

  return _dbPromise;
}

export async function idbPutWork(work){
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(work);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetWork(id){
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteWork(id){
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function ensurePrivateWorkFrames(id){
  const existing = await idbGetWork(id);
  if (existing && Array.isArray(existing.frames) && existing.frames.length === 60) return existing.frames;
  const frames = Array.from({length:60}, () => null);
  await idbPutWork({ id, frames, updatedAt: Date.now() });
  return frames;
}

export async function savePrivateFrames(id, frames){
  await idbPutWork({ id, frames, updatedAt: Date.now() });
}

export async function deletePrivateWorkFrames(id){
  await idbDeleteWork(id);
}

export async function loadPrivateFrames(id){
  const r = await idbGetWork(id);
  return r?.frames || null;
}
