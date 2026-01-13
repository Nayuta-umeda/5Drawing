
import { DEFAULT_SERVER_BASE } from "./config.js";

export const CFG = {
  W: 256,
  H: 256,
  FRAME_COUNT: 60,
  FPS: 12,

  ONION_OPACITY: 0.20,

  // 予約の時間（サーバーと合わせる）
  RESERVE_MS: 90_000,

  // ② 提出は「送信」か「60秒」
  AUTO_SUBMIT_MS: 60_000,

  WS_BASE_KEY: "anim5s_wsBase",
  MYROOMS_KEY: "anim5s_myRooms",
  ACTION_KEY: "anim5s_pendingAction",
};

export const $ = (id) => document.getElementById(id);

export function makeToast(){
  const toast = $("toast");
  const toastText = $("toastText");
  let timer = null;
  return (msg, ms=1400) => {
    if(!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(()=>toast.classList.remove("on"), ms);
  };
}

export function getWsBase(){
  // UI入力は無し。config.js が基本。
  const stored = (localStorage.getItem(CFG.WS_BASE_KEY) || "").trim();
  if(stored) return stored;

  const def = (DEFAULT_SERVER_BASE || "").trim();
  if(def && def !== "https://YOUR-SERVER-URL"){
    localStorage.setItem(CFG.WS_BASE_KEY, def);
    return def;
  }
  return "";
}

export function wsUrlFromBase(base){
  const raw = String(base||"").trim();
  if(!raw) return "";
  if(/^wss?:\/\//i.test(raw)){
    // 直接 ws/wss が来たらそのまま
    return raw.replace(/\/$/,"");
  }
  try{
    const u = new URL(raw);
    const proto = (u.protocol === "https:") ? "wss:" : "ws:";
    const path = u.pathname.replace(/\/$/,"");
    u.protocol = proto;
    // /ws を付ける
    u.pathname = (path === "" || path === "/") ? "/ws" : (path.endsWith("/ws") ? path : (path + "/ws"));
    return u.toString();
  }catch{
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
