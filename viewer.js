import { qs, clamp, loadPublicSnapshotFrames, FRAME_COUNT, FPS } from "./util.js";

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const roomId = (qs("roomId") || "").toString().toUpperCase();
const themeQ = (qs("theme") || "").toString();
const allowLive = qs("live") === "1";
// Phase2: viewer is local-only by default

// Optional: start at a specific frame (1-30). Used to jump to the user's contributed frame.
let startFrameIndex = 0;
try{
  const startQ = Number(qs("start") ?? 1);
  if (Number.isFinite(startQ)) startFrameIndex = clamp(Math.floor(startQ) - 1, 0, FRAME_COUNT - 1);
}catch(_e){ /* ignore */ }

window.V15.addLog("viewer_init", { roomId, allowLive, search: location.search });

const sub = document.getElementById("sub");
const net = document.getElementById("net");

function setStatus(msg){
  try{
    if (net) net.textContent = String(msg || "");
  }catch(_e){}
}

const slider = document.getElementById("slider");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");
const gifSave = document.getElementById("gifSave");

const c = document.getElementById("c");
const ctx = c.getContext("2d");

let filled = Array.from({length:FRAME_COUNT}, ()=>false);
let cache = Array.from({length:FRAME_COUNT}, ()=>null);
let cur = 0;

// Phase3: room-level deadline display (best-effort)
let roomDeadlineAt = 0;
let roomPhase = "";

function fmt(ms){
  if (!Number.isFinite(ms)) return "--:--";
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function renderFrameLabel(){
  const extra = (roomDeadlineAt && Number.isFinite(roomDeadlineAt))
    ? ` / 部屋 ${fmt(roomDeadlineAt - Date.now())}`
    : "";
  frameLabel.textContent = `コマ ${cur+1} / ${FRAME_COUNT}${extra}`;
}

function paintWhite(){
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,c.width,c.height);
  ctx.restore();
}

function drawFrame(i){
  paintWhite();
  const dataUrl = cache[i];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => { paintWhite(); ctx.drawImage(img,0,0,c.width,c.height); };
  img.src = dataUrl;
}

function setCur(i){
  cur = clamp(i,0,FRAME_COUNT - 1);
  slider.value = String(cur+1);
  renderFrameLabel();
  drawFrame(cur);
  if (filled[cur] && !cache[cur]) requestFrame(cur);
}

prev.onclick = () => setCur(cur-1);
next.onclick = () => setCur(cur+1);
slider.oninput = () => setCur(parseInt(slider.value,10)-1);

paintWhite();

let ws = null;
let connected = false;
const pending = new Map(); // frameIndex -> { tries, t }
const waiters = new Map();
const FRAME_RETRY_MAX = 3;

function clearPendingEntry(i){
  const e = pending.get(i);
  if (e && e.t) clearTimeout(e.t);
  pending.delete(i);
}

function clearPending(){
  for (const [,e] of pending){
    if (e && e.t) clearTimeout(e.t);
  }
  pending.clear();
}

function waitForFrame(i, ms=2500){
  return new Promise((resolve) => {
    if (cache[i]) return resolve(cache[i]);
    const t = setTimeout(() => { waiters.delete(i); resolve(null); }, ms);
    waiters.set(i, { resolve, t });
  });
}

function requestFrame(i, force=false){
  if (!ws || !connected) return;
  if (cache[i]) return;

  const cur = pending.get(i);
  if (cur && !force) return;
  const tries = (cur?.tries ?? 0);
  if (tries >= FRAME_RETRY_MAX){
    clearPendingEntry(i);
    return;
  }
  if (cur && cur.t) clearTimeout(cur.t);

  const next = { tries: tries + 1, t: null };
  pending.set(i, next);
  try{
    ws.send(JSON.stringify({ v:1, t:"get_frame", ts:Date.now(), data:{ roomId, frameIndex:i } }));
  }catch(_e){}

  const backoff = 800 + (next.tries-1)*450 + Math.floor(Math.random()*220);
  next.t = setTimeout(() => {
    const e = pending.get(i);
    if (!e) return;
    if (cache[i]){
      clearPendingEntry(i);
      return;
    }
    requestFrame(i, true);
  }, backoff);
}

if (!roomId){
  sub.textContent = "お題：-";
  setStatus("表示：部屋IDなし");
  setCur(startFrameIndex);
} else {
  sub.textContent = "お題：" + (themeQ || "-");
  setStatus("表示：ローカル履歴（更新はギャラリーの「更新」から）");
  initLocalSnapshot();
  if (allowLive){
    ws = window.V15.createLoggedWebSocket();
  
    net.textContent = "接続：接続中…";

    ws.addEventListener("open", () => {
      connected = true;
      ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
      ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId, view:true } }));
      ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId } }));
    });

    ws.addEventListener("message", (ev) => {
      try{
        const m = JSON.parse(ev.data);
        if (m.t === "room_state") {
          const d = m.data || {};
          if (d.theme) sub.textContent = "お題：" + d.theme;
          if (typeof d.phase === "string") roomPhase = d.phase;
          if (Number.isFinite(Number(d.deadlineAt))) roomDeadlineAt = Number(d.deadlineAt);
          if (Array.isArray(d.filled) && d.filled.length >= FRAME_COUNT) filled = d.filled.slice(0, FRAME_COUNT);
          net.textContent = "接続：OK" + (roomPhase ? `（${roomPhase}）` : "");
          renderFrameLabel();
          if (filled[0] && !cache[0]) requestFrame(0);
          if (filled[cur] && !cache[cur]) requestFrame(cur);
        }
        if (m.t === "frame_data") {
          const d = m.data || {};
          const i = d.frameIndex;
          if (typeof i === "number" && i>=0 && i<FRAME_COUNT && typeof d.dataUrl === "string"){
            cache[i] = d.dataUrl;
            clearPendingEntry(i);
            if (i === cur) drawFrame(cur);
            const w = waiters.get(i);
            if (w){ clearTimeout(w.t); w.resolve(d.dataUrl); waiters.delete(i); }
          }
        }
      }catch(e){}
    });

    ws.addEventListener("error", () => {
      connected = false;
      net.textContent = "接続：エラー";
      clearPending();
    });
    ws.addEventListener("close", () => {
      connected = false;
      net.textContent = "接続：切断";
      clearPending();
    });
  } else {
    net.textContent = "接続：ローカル（更新はギャラリーの「更新」）";
  }
  setCur(startFrameIndex);
}


// GIF Save button
if (gifSave){
  gifSave.onclick = async () => {
    try{
      for (let i=0;i<FRAME_COUNT;i++){
        if (filled[i] && !cache[i]){ requestFrame(i); await waitForFrame(i, 2500); }
      }
      const dataUrls = Array.from({length:FRAME_COUNT}, (_,i)=> cache[i] || null);
      const themeText = (sub?.textContent || "").replace(/^お題：/,"").trim() || "anim";
      const safeTheme = themeText.replace(/[\\/:*?\"<>|]/g, "_");
      const safeRoom = (roomId || "room").replace(/[^A-Z0-9_-]/g, "_");
      const filename = `${safeTheme}_${safeRoom}.gif`;
      const mod = await import("./gif.js");
      await mod.exportGifFromDataUrls({ width:256, height:256, dataUrls, fps: FPS, filename });
      // V50: send "GIFで保存" count for public ranking (best-effort)
      await notifyGifSaved();
    }catch(e){
      window.V15?.addLog?.("gif_save_failed", { message: String(e?.message || e) });
      alert("GIF保存に失敗しました。");
    }
  };
}

async function notifyGifSaved(){
  const rid = String(roomId || "").trim().toUpperCase();
  if (!rid) return;

  // If we are in live mode, reuse the existing WS.
  if (ws && connected){
    try{
      ws.send(JSON.stringify({ v:1, t:"gif_saved", ts: Date.now(), data:{ roomId: rid } }));
      window.V15?.addLog?.("gif_saved_sent", { roomId: rid, via:"reuse" });
    }catch(_e){}
    return;
  }

  // Otherwise, fire a tiny one-shot WS (do not block UX if it fails).
  try{
    const w = window.V15.createLoggedWebSocket();
    let opened = false;
    const openP = new Promise((resolve) => {
      const to = setTimeout(resolve, 900);
      w.addEventListener("open", () => { opened = true; clearTimeout(to); resolve(); }, { once:true });
    });
    await openP;
    if (!opened){ try{ w.close(); }catch(_e){}; return; }

    try{ w.send(JSON.stringify({ v:1, t:"hello", ts: Date.now(), data:{} })); }catch(_e){}
    try{ w.send(JSON.stringify({ v:1, t:"gif_saved", ts: Date.now(), data:{ roomId: rid } })); }catch(_e){}
    window.V15?.addLog?.("gif_saved_sent", { roomId: rid, via:"oneshot" });

    setTimeout(() => { try{ w.close(); }catch(_e){} }, 500);
  }catch(_e){}
}
async function initLocalSnapshot(){
  try{
    setStatus("表示：ローカル履歴（更新はギャラリーの「更新」から）");
    const snap = await loadPublicSnapshotFrames(roomId);
    if (!snap){
      setStatus("表示：ローカル履歴なし（ギャラリーで「更新」すると表示できます）");
      drawFrame(cur);
      return;
    }
    if (Array.isArray(snap) && snap.length >= FRAME_COUNT){
      for (let i=0;i<FRAME_COUNT;i++){
        cache[i] = snap[i] || null;
        filled[i] = !!snap[i];
      }
    }
    drawFrame(cur);
   }catch(e){
    window.V15.addLog("error", { message: "viewer_local_load_failed: " + (e && (e.message||String(e))) });
    setStatus("表示：ローカル履歴の読み込みに失敗しました");
  }
}

// Phase3: keep the deadline label ticking (best-effort)
setInterval(() => {
  try{
    if (roomDeadlineAt) renderFrameLabel();
  }catch(_e){}
}, 1000);

