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
