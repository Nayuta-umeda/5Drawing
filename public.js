import { clamp } from "./util.js";

window.V15?.ensureLogUi?.();
window.V15?.addLog?.("page_load", { path: location.pathname });

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const tabNew = document.getElementById("tabNew");
const tabRank = document.getElementById("tabRank");

let sort = "new";
let ws = null;
let connected = false;

function setStatus(msg){
  try{ statusEl.textContent = String(msg || ""); }catch(_e){}
}

function fmtTs(ts){
  const t = Number(ts || 0) || 0;
  if (!t) return "-";
  try{
    return new Date(t).toLocaleString("ja-JP", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }catch(_e){
    return String(t);
  }
}

function setTabs(){
  if (sort === "rank"){
    tabRank.classList.add("btnAccent");
    tabRank.classList.remove("btnGhost");
    tabNew.classList.add("btnGhost");
    tabNew.classList.remove("btnAccent");
  }else{
    tabNew.classList.add("btnAccent");
    tabNew.classList.remove("btnGhost");
    tabRank.classList.add("btnGhost");
    tabRank.classList.remove("btnAccent");
  }
}

function clearList(){
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
}

function render(items){
  clearList();

  if (!Array.isArray(items) || !items.length){
    const p = document.createElement("div");
    p.className = "small muted";
    p.style.lineHeight = "1.6";
    p.textContent = "完成済みの公開作品がまだありません。";
    listEl.appendChild(p);
    return;
  }

  for (const it of items){
    const roomId = String(it.roomId || "").toUpperCase();
    const theme = String(it.theme || "");
    const gifSaves = Math.max(0, Number(it.gifSaves || 0) || 0);
    const completedAt = Number(it.completedAt || 0) || 0;
    const updatedAt = Number(it.updatedAt || 0) || 0;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "itemBtn";

    const h = document.createElement("div");
    h.className = "itemTitle";
    h.textContent = theme ? `お題：${theme}` : `部屋：${roomId}`;

    const meta = document.createElement("div");
    meta.className = "itemMeta";

    const left = document.createElement("div");
    left.innerHTML = `<span class="pill">${roomId}</span>`;

    const right = document.createElement("div");
    const when = fmtTs(completedAt || updatedAt);
    if (sort === "rank"){
      right.innerHTML = `<span class="pill">GIF保存 ${gifSaves}</span> <span class="pill">${when}</span>`;
    }else{
      right.innerHTML = `<span class="pill">${when}</span> <span class="pill">GIF保存 ${gifSaves}</span>`;
    }

    meta.appendChild(left);
    meta.appendChild(right);

    btn.appendChild(h);
    btn.appendChild(meta);

    btn.onclick = () => {
      if (!roomId) return;
      window.V15?.addLog?.("open_public_viewer", { roomId });
      location.href = `./viewer.html?roomId=${encodeURIComponent(roomId)}&live=1`;
    };

    listEl.appendChild(btn);
  }
}

function send(obj){
  try{ ws.send(JSON.stringify(obj)); }catch(_e){}
}

function requestList(){
  if (!ws || !connected){
    setStatus("接続中…");
    return;
  }
  setStatus(sort === "rank" ? "ランキングを取得中…" : "新着を取得中…");
  send({ v:1, t:"list_public_completed", ts: Date.now(), data:{ sort, limit: 120 } });
}

function connect(){
  try{
    ws = window.V15.createLoggedWebSocket();
  }catch(e){
    setStatus("接続できません（設定を確認してね）");
    return;
  }

  connected = false;

  const openWatch = setTimeout(() => {
    if (!connected) setStatus("接続に時間がかかっています…");
  }, 3500);

  ws.addEventListener("open", () => {
    connected = true;
    clearTimeout(openWatch);
    setStatus("接続完了。取得中…");
    send({ v:1, t:"hello", ts: Date.now(), data:{} });
    requestList();
  });

  ws.addEventListener("close", () => {
    connected = false;
    clearTimeout(openWatch);
    setStatus("切断されました。ロビーに戻って再試行してね。");
  });

  ws.addEventListener("error", () => {
    connected = false;
    clearTimeout(openWatch);
    setStatus("接続エラー。" );
  });

  ws.addEventListener("message", (ev) => {
    let m = null;
    try{ m = JSON.parse(String(ev.data)); }catch(_e){ return; }
    const t = String(m.t || "");
    const d = m.data || {};

    if (t === "public_completed_list"){
      setStatus(sort === "rank" ? "ランキング表示" : "新着表示");
      render(d.items || []);
      return;
    }

    if (t === "error"){
      const msg = (d && d.message) ? String(d.message) : "エラー";
      setStatus(msg);
      return;
    }
  });
}

function setSort(next){
  sort = (next === "rank") ? "rank" : "new";
  setTabs();
  requestList();
}

// UI wiring
setTabs();

tabNew.addEventListener("click", () => setSort("new"));
tabRank.addEventListener("click", () => setSort("rank"));

connect();

// Keep things safe on navigation
window.addEventListener("beforeunload", () => {
  try{ ws?.close(); }catch(_e){}
});
