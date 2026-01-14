/* Small helpers for V12 pages */
export function qs(name){ return new URLSearchParams(location.search).get(name); }
export function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

export function loadJson(key, fallback){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch(e) { return fallback; }
}
export function saveJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

export function addMyRoom(room){
  const key = "anim5s_my_rooms_v12";
  const list = loadJson(key, []);
  const exists = list.some(x => x.roomId === room.roomId);
  if (!exists) list.unshift(room);
  saveJson(key, list.slice(0, 50));
}

/**
 * ④: 自分が描いた時点の作品状態（スナップショット）を保存
 * - frames 全体を丸ごと保存すると重いので、dataUrlがあるコマだけ [index, dataUrl] で保存する
 */
export function saveWorkSnapshot({ roomId, theme, frames, myFrameIndex }){
  const key = "anim5s_my_works_v13";
  const list = loadJson(key, []);
  const id = (Date.now().toString(36) + Math.random().toString(36).slice(2,6)).toUpperCase();

  const pairs = [];
  if (Array.isArray(frames)) {
    for (let i=0;i<frames.length;i++){
      const v = frames[i];
      if (typeof v === "string" && v.startsWith("data:image/")) pairs.push([i, v]);
    }
  }
  const item = {
    id,
    roomId,
    theme: theme || "",
    at: Date.now(),
    myFrameIndex: (typeof myFrameIndex === "number") ? myFrameIndex : -1,
    snapshotPairs: pairs,
    snapshotCount: pairs.length
  };

  list.unshift(item);

  // 上限（localStorageの容量対策）：最新20件まで
  try {
    saveJson(key, list.slice(0, 20));
  } catch(e) {
    // もし容量で死んだら、超軽量化（自分のコマだけ）
    const mini = { ...item, snapshotPairs: pairs.filter(p => p[0] === myFrameIndex), snapshotCount: 1 };
    saveJson(key, [mini, ...list].slice(0, 20));
  }
  return item;
}

export function loadWorkSnapshotById(id){
  const list = loadJson("anim5s_my_works_v13", []);
  return list.find(x => x.id === id) || null;
}

export function buildFramesFromPairs(pairs, length=60){
  const frames = Array.from({length}, () => null);
  if (Array.isArray(pairs)) {
    for (const [i, v] of pairs) {
      if (typeof i === "number" && i>=0 && i<length && typeof v === "string") frames[i] = v;
    }
  }
  return frames;
}
