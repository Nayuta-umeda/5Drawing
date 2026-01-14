// 共通（moduleは使わない / file:// でも動く）
// window.Anim5S に全部入れる
(function(){
  const DEFAULT_SERVER_BASE = (window.Anim5SConfig && window.Anim5SConfig.DEFAULT_SERVER_BASE) || "";

  const CFG = {
    W: 256,
    H: 256,
    FRAME_COUNT: 60,
    FPS: 12,
    ROOM_ID_LEN: 7,
    ONION_OPACITY: 0.20,
    RESERVE_MS: 190_000,
    AUTO_SUBMIT_MS: 180_000,
    WS_BASE_KEY: "anim5s_wsBase",
    MYROOMS_KEY: "anim5s_myRooms",
    ACTION_KEY: "anim5s_pendingAction",
  };

  const $ = (id) => document.getElementById(id);

  function makeToast(){
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

  function getWsBase(){
    // まず config.js の既定値を優先（古い保存URLで詰まるのを防ぐ）
    const def = (DEFAULT_SERVER_BASE || "").trim().replace(/\/+$/,"");
    if(def && def !== "https://YOUR-SERVER-URL"){
      try{ localStorage.setItem(CFG.WS_BASE_KEY, def); }catch{}
      return def;
    }
    // 既定値が無い場合のみ保存値を使う
    try{
      const stored = (localStorage.getItem(CFG.WS_BASE_KEY) || "").trim().replace(/\/+$/,"");
      if(stored) return stored;
    }catch{}
    return "";
  }

  function wsUrlFromBase(base){
    const raw = String(base||"").trim();
    if(!raw) return "";
    try{
      const u = new URL(raw);
      // https → wss / http → ws / ws,wss はそのまま
      if(u.protocol === "https:") u.protocol = "wss:";
      else if(u.protocol === "http:") u.protocol = "ws:";
      // pathname に /ws を 1回だけ付ける（/ws, /ws/, /ws? などでもOKにする）
      const p = u.pathname.replace(/\/+$/,"");
      u.pathname = (p === "" || p === "/") ? "/ws" : (p.endsWith("/ws") ? p : (p + "/ws"));
      return u.toString();
    }catch(e){
      // "anim5s-server.onrender.com" のようにプロトコル無しで来てもOK
      const host = raw
        .replace(/^wss?:\/\//i,"")
        .replace(/^https?:\/\//i,"")
        .replace(/\/+$/,"");
      return "wss://" + host + "/ws";
    }
  }

  function loadMyRooms(){
    try{
      const raw = localStorage.getItem(CFG.MYROOMS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{
      return [];
    }
  }
  function saveMyRooms(arr){
    localStorage.setItem(CFG.MYROOMS_KEY, JSON.stringify(arr.slice(0,200)));
  }
  function touchMyRoom(entry){
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

  function savePendingAction(action){
    // sessionStorage が死んでる環境があるので、localStorageにフォールバック
    const payload = { action, ts: Date.now() };
    try{
      sessionStorage.setItem(CFG.ACTION_KEY, JSON.stringify(payload));
      return;
    }catch{}
    try{
      localStorage.setItem(CFG.ACTION_KEY, JSON.stringify(payload));
    }catch{}
  }
  function loadPendingAction(){
    const read = (store) => {
      try{
        const raw = store.getItem(CFG.ACTION_KEY);
        if(!raw) return null;
        const obj = JSON.parse(raw);
        if(!obj || !obj.action) return null;
        // 5分で期限切れ
        if(obj.ts && (Date.now() - obj.ts > 5*60*1000)) return null;
        return obj.action;
      }catch{ return null; }
    };
    let a = null;
    try{ a = read(sessionStorage); }catch{}
    if(a) return a;
    try{ a = read(localStorage); }catch{}
    return a;
  }
  function clearPendingAction(){
    try{ sessionStorage.removeItem(CFG.ACTION_KEY); }catch{}
    try{ localStorage.removeItem(CFG.ACTION_KEY); }catch{}
  }

  window.Anim5S = {
    CFG, $, makeToast,
    getWsBase, wsUrlFromBase,
    loadMyRooms, saveMyRooms, touchMyRoom,
    savePendingAction, loadPendingAction, clearPendingAction,
  };
})();
