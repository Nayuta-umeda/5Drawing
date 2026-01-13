
// 共通（ロビー系 / エディタ系）
export const CFG = {
  W: 256,
  H: 256,
  FRAME_COUNT: 60,
  FPS: 12,
  ONION_OPACITY: 0.20,
  RESERVE_MS: 90_000,
  MAX_AUTOSEND_INTERVAL: 380,
  WS_BASE_KEY: "anim5s_wsBase",
  MYROOMS_KEY: "anim5s_myRooms",
  ACTION_KEY: "anim5s_pendingAction",
};

export const $ = (id) => document.getElementById(id);

export function escapeHtml(s){
  return String(s).replace(/[&<>\"]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[m]));
}

export function makeToast(){
  const toast = $("toast");
  const toastText = $("toastText");
  let timer = null;
  return (msg, ms=1400) => {
    toastText.textContent = msg;
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(()=>toast.classList.remove("on"), ms);
  };
}

export function getWsBase(){
  return localStorage.getItem(CFG.WS_BASE_KEY) || "";
}
export function setWsBase(v){
  localStorage.setItem(CFG.WS_BASE_KEY, (v||"").trim());
}

export function wsUrlFromBase(base){
  const raw = String(base||"").trim();
  if(!raw) return "";
  // 1) すでに ws/wss ならそれを使う
  if(/^wss?:\/\//i.test(raw)){
    return raw.replace(/\/$/,"");
  }
  // 2) http/https を wss/ws に変換して /ws へ
  try{
    const u = new URL(raw);
    const isHttps = u.protocol === "https:";
    const proto = isHttps ? "wss:" : "ws:";
    // /ws を付ける（pathがあるなら末尾に追加）
    const path = u.pathname.replace(/\/$/,"");
    u.protocol = proto;
    u.pathname = (path === "" || path === "/") ? "/ws" : (path + (path.endsWith("/ws") ? "" : "/ws"));
    return u.toString();
  }catch{
    // 3) ドメインだけっぽい時
    return "wss://" + raw.replace(/\/$/,"") + "/ws";
  }
}

export function loadMyRooms(){
  try{
    const raw = localStorage.getItem(CFG.MYROOMS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

export function saveMyRooms(arr){
  localStorage.setItem(CFG.MYROOMS_KEY, JSON.stringify(arr.slice(0,200)));
}

export function touchMyRoom(entry){
  const rooms = loadMyRooms();
  const i = rooms.findIndex(x=>x.roomId===entry.roomId);
  const now = Date.now();
  const v = {
    roomId: entry.roomId,
    theme: entry.theme || "-",
    visibility: entry.visibility || "public",
    pass: entry.pass || (i>=0 ? rooms[i].pass : undefined),
    last: now,
  };
  if(i>=0) rooms.splice(i,1);
  rooms.unshift(v);
  saveMyRooms(rooms);
  return rooms;
}

export function savePendingAction(action){
  sessionStorage.setItem(CFG.ACTION_KEY, JSON.stringify(action));
}

export function loadPendingAction(){
  try{
    const raw = sessionStorage.getItem(CFG.ACTION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{
    return null;
  }
}

export function clearPendingAction(){
  sessionStorage.removeItem(CFG.ACTION_KEY);
}
