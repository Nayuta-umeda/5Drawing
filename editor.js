import { qs, clamp, addPublicWork, updateWorkMeta, ensurePrivateWorkFrames, savePrivateFrames, ensurePublicSnapshotFrames, savePublicSnapshotFrames, loadPublicSnapshotFrames } from "./util.js";
window.V15.ensureLogUi();
window.V15.addLog("editor_init", { href: location.href });

const mode = (qs("mode") || "").toString();
const isCreatePublic = mode === "create_public";
const isJoinPublic = mode === "join_public";
const isPrivateLocal = mode === "private_local";

let theme = (qs("theme") || "お題").toString();
let roomId = (qs("roomId") || "").toString().toUpperCase();
let assigned = Number(qs("assigned") ?? -1);
if (!Number.isFinite(assigned)) assigned = -1;


let draftId = (qs("draftId") || "").toString();
if (isCreatePublic && !draftId){
  draftId = Math.random().toString(36).slice(2,9).toUpperCase();
  const sp = new URLSearchParams(location.search);
  sp.set("draftId", draftId);
  history.replaceState(null, "", location.pathname + "?" + sp.toString());
}

const reservationToken = (qs("reservationToken") || "").toString();
const reservationExpiresAt = Number(qs("reservationExpiresAt") ?? 0);
const workId = (qs("workId") || "").toString();

// UI
const themeName = document.getElementById("themeName");
const roomIdLabel = document.getElementById("roomIdLabel");
const assignedLabel = document.getElementById("assignedLabel");
const viewingLabel = document.getElementById("viewingLabel");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const primaryBtn = document.getElementById("primaryBtn");

const tabDraw = document.getElementById("tabDraw");
const tabView = document.getElementById("tabView");
const panelDraw = document.getElementById("panelDraw");
const panelView = document.getElementById("panelView");

const viewSlider = document.getElementById("viewSlider");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");
const lockHint = document.getElementById("lockHint");
const lockOverlay = document.getElementById("lockOverlay");

const toolPen = document.getElementById("toolPen");
const toolEraser = document.getElementById("toolEraser");
const undoBtn = document.getElementById("undo");
const clearBtn = document.getElementById("clear");
const sizeEl = document.getElementById("size");
const sizeVal = document.getElementById("sizeVal");
const paletteEl = document.getElementById("palette");

const saveRow = document.getElementById("saveRow");
const saveBtn = document.getElementById("saveBtn");
const gifBtn = document.getElementById("gifBtn");

const toastMask = document.getElementById("toastMask");
const toastTitle = document.getElementById("toastTitle");
const toastText = document.getElementById("toastText");

// Canvas
const c = document.getElementById("c");
const ctx = c.getContext("2d");

// Onion-skin overlay (not baked into saved frames)
const onionC = document.getElementById("onionC");
const onionCtx = onionC ? onionC.getContext("2d") : null;
let activeTab = "draw";


// Palette
const PALETTE = [
  { name:"INK", v:"#1f2937" },
  { name:"PINK", v:"#ffb3c7" },
  { name:"PEACH", v:"#ffd6a5" },
  { name:"BUTTER", v:"#fff1a8" },
  { name:"MINT", v:"#caffbf" },
  { name:"SKY", v:"#bde0fe" },
  { name:"LAVENDER", v:"#d7baff" },
  { name:"AQUA", v:"#b8f2e6" },
];

let cur = 0;
let tool = "pen";
let color = PALETTE[0].v;
let size = 6;

let frames = Array.from({length:60}, ()=>null);
let filled = Array.from({length:60}, ()=>false);

// Undo
const undoStack = [];
function snapshot(){
  try{
    const img = ctx.getImageData(0,0,c.width,c.height);
    undoStack.push(img);
    if (undoStack.length > 30) undoStack.shift();
  }catch(e){}
}
function undo(){
  const img = undoStack.pop();
  if (!img) return;
  ctx.putImageData(img,0,0);
  internalDraftUpdate();
}

function paintWhite(){
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,c.width,c.height);
  ctx.restore();
}
function setStatus(t){ statusEl.textContent = t; }

function setTab(name){
  const draw = name === "draw";
  activeTab = draw ? "draw" : "view";
  tabDraw.classList.toggle("active", draw);
  tabView.classList.toggle("active", !draw);
  panelDraw.classList.toggle("hidden", !draw);
  panelView.classList.toggle("hidden", draw);
  c.style.pointerEvents = draw ? "auto" : "none";
  updateOnion();
}
tabDraw.onclick = () => setTab("draw");
tabView.onclick = () => setTab("view");

function isEditable(){
  if (isPrivateLocal) return true;
  if (assigned < 0) return false;
  return cur === assigned;
}

function renderPalette(){
  paletteEl.innerHTML = "";
  PALETTE.forEach((p) => {
    const b = document.createElement("button");
    b.className = "swatch" + (p.v === color ? " sel" : "");
    b.style.background = p.v;
    b.title = p.name;
    b.onclick = () => { color = p.v; renderPalette(); };
    paletteEl.appendChild(b);
  });
}
renderPalette();

function setTool(t){
  tool = t;
  toolPen.classList.toggle("on", t==="pen");
  toolEraser.classList.toggle("on", t==="eraser");
}
toolPen.onclick = () => setTool("pen");
toolEraser.onclick = () => setTool("eraser");

sizeEl.value = String(size);
sizeVal.textContent = String(size);
sizeEl.oninput = () => { size = parseInt(sizeEl.value,10); sizeVal.textContent = String(size); };

undoBtn.onclick = () => { if (isEditable()) undo(); };
clearBtn.onclick = () => {
  if (!isEditable()) return;
  snapshot();
  paintWhite();
  internalDraftUpdate();
};

// Draft update
function internalDraftUpdate(){
  if (!isEditable()) return;
  const dataUrl = c.toDataURL("image/png");
  frames[cur] = dataUrl;

  if (isPrivateLocal) return;

  try{ sessionStorage.setItem(draftKey(), dataUrl); }catch(e){}
  window.V15.addLog("draft_updated", { frame: cur+1, bytes: dataUrl.length, mode });
}
function draftKey(){
  if (isCreatePublic) return `anim5s_draft_createpub:${draftId}`;
  return `anim5s_draft_joinpub:${roomId}:${reservationToken}:${assigned}`;
}
function loadDraft(){
  try{ return sessionStorage.getItem(draftKey()); }catch(e){ return null; }
}

function updateLabels(){
  themeName.textContent = "お題：" + (theme || "-");
  roomIdLabel.textContent = roomId || (isCreatePublic ? "(未作成)" : "-");
  assignedLabel.textContent = isPrivateLocal ? "ALL" : ((assigned>=0)? `${assigned+1}/60` : (isCreatePublic ? "1/60" : "-"));
  viewingLabel.textContent = `${cur+1}/60`;
  frameLabel.textContent = `コマ ${cur+1} / 60`;
}
function updateOverlay(){
  const locked = (!isPrivateLocal && assigned>=0 && cur!==assigned);
  lockOverlay.style.display = locked ? "flex" : "none";
}

function drawFrame(i){
  paintWhite();
  if (!frames[i]) return;
  const img = new Image();
  img.onload = () => { paintWhite(); ctx.drawImage(img,0,0,c.width,c.height); };
  img.src = frames[i];
}

function canDrawThisFrame(){
  // "描く"タブで実際に描ける状態のときだけ onion を出す
  if (activeTab !== "draw") return false;
  if (isPrivateLocal) return true;
  if (isCreatePublic) return cur === 0;
  if (isJoinPublic) return (assigned >= 0 && cur === assigned);
  return false;
}

function drawDataUrlToCanvas(dataUrl, destCtx){
  return new Promise((resolve) => {
    try{
      if (!destCtx || !dataUrl) return resolve(false);
      const img = new Image();
      img.onload = () => {
        try{
          destCtx.clearRect(0,0,destCtx.canvas.width,destCtx.canvas.height);
          destCtx.drawImage(img,0,0,destCtx.canvas.width,destCtx.canvas.height);
          resolve(true);
        }catch(_e){ resolve(false); }
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    }catch(_e){ resolve(false); }
  });
}

function clearCanvas2D(destCtx){
  try{ destCtx.clearRect(0,0,destCtx.canvas.width,destCtx.canvas.height); }catch(_e){}
}

function updateOnion(){
  try{
    if (!onionC || !onionCtx) return;
    const show = canDrawThisFrame() && cur > 0 && !!frames[cur-1];
    if (show){
      drawDataUrlToCanvas(frames[cur-1], onionCtx);
      onionC.style.display = "block";
    }else{
      onionC.style.display = "none";
      clearCanvas2D(onionCtx);
    }
  }catch(_e){}
}


function setCur(i){
  cur = clamp(i,0,59);
  viewSlider.value = String(cur+1);
  updateLabels();
  updateOverlay();
  drawFrame(cur);

  if (!isPrivateLocal) {
    if (cur !== assigned) {
      lockHint.textContent = "非担当コマは閲覧のみ（薄グレー＋❌）。";
      lockHint.style.color = "var(--muted)";
    } else {
      lockHint.textContent = "担当コマです。描けます（提出は送信）。";
      lockHint.style.color = "var(--text)";
      if (!frames[cur]) {
        const dft = loadDraft();
        if (dft && dft.startsWith("data:image/")) { frames[cur] = dft; drawFrame(cur); }
      }
    }
    if (filled[cur] && !frames[cur]) requestFrame(cur);
      // onion-skin needs previous frame (best-effort)
      if (canDrawThisFrame() && cur>0 && filled[cur-1] && !frames[cur-1]) requestFrame(cur-1);
  } else {
    lockHint.textContent = "プライベート：全コマ自由。保存/GIFは「見る」タブ。";
    lockHint.style.color = "var(--text)";
  }

  updateOnion();
}

viewSlider.oninput = () => setCur(parseInt(viewSlider.value,10)-1);
prevBtn.onclick = () => setCur(cur-1);
nextBtn.onclick = () => setCur(cur+1);

// drawing
let drawing = false;
let last = null;

function posFromEvent(ev){
  const r = c.getBoundingClientRect();
  const x = (ev.clientX - r.left) * (c.width / r.width);
  const y = (ev.clientY - r.top) * (c.height / r.height);
  return {x,y};
}
function stroke(p0,p1){
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;

  if (tool === "eraser"){
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
  }
  ctx.beginPath();
  ctx.moveTo(p0.x,p0.y);
  ctx.lineTo(p1.x,p1.y);
  ctx.stroke();
  ctx.restore();
}

function onDown(ev){
  if (!isEditable()) return;
  drawing = true;
  c.setPointerCapture(ev.pointerId);
  last = posFromEvent(ev);
  snapshot();
}
function onMove(ev){
  if (!drawing || !isEditable()) return;
  const p = posFromEvent(ev);
  if (last) stroke(last,p);
  last = p;
}
function onUp(){
  if (!drawing) return;
  drawing = false;
  last = null;
  internalDraftUpdate();
}

c.addEventListener("pointerdown", onDown);
c.addEventListener("pointermove", onMove);
c.addEventListener("pointerup", onUp);
c.addEventListener("pointercancel", onUp);

// Timer
let personalDeadlineAt = (isPrivateLocal ? Infinity : (Date.now() + 3*60*1000));
if (!isPrivateLocal && isJoinPublic && Number.isFinite(reservationExpiresAt) && reservationExpiresAt > 0){
  personalDeadlineAt = reservationExpiresAt;
}
let timerLeftMs = (isPrivateLocal ? Infinity : Math.max(0, personalDeadlineAt - Date.now()));
let timerId = null;

// Room-level deadline (Phase3)
let roomDeadlineAt = 0;
let roomPhase = "";

function fmt(ms){
  if (!Number.isFinite(ms)) return "制限なし";
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}
function tick(){
  if (!isPrivateLocal){
    timerLeftMs = Math.max(0, personalDeadlineAt - Date.now());
  }
  renderTimer();
  if (timerLeftMs <= 0){
    timerLeftMs = 0;
    renderTimer();
    stopTimer();
    if (!isPrivateLocal) primaryAction(true);
  }
}

function renderTimer(){
  if (isPrivateLocal) { timerEl.textContent = "制限なし"; return; }
  const parts = [];
  parts.push("担当 " + fmt(timerLeftMs));
  if (roomDeadlineAt && Number.isFinite(roomDeadlineAt)){
    const roomLeft = Math.max(0, roomDeadlineAt - Date.now());
    parts.push("部屋 " + fmt(roomLeft));
  }
  timerEl.textContent = "残り " + parts.join(" / ");
}
function startTimer(){
  if (isPrivateLocal) { timerEl.textContent = "制限なし"; return; }
  renderTimer();
  if (timerId) return;
  timerId = setInterval(tick, 200);
}
function stopTimer(){
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

// Network
let ws = null;
let connected = false;
const pendingFrames = new Set();

function requestFrame(i){
  if (!ws || !connected) return;
  if (pendingFrames.has(i)) return;
  pendingFrames.add(i);
  ws.send(JSON.stringify({ v:1, t:"get_frame", ts:Date.now(), data:{ roomId, frameIndex:i } }));
}

function connectIfNeeded(){
  if (isPrivateLocal) return;

  ws = window.V15.createLoggedWebSocket();
  ws.addEventListener("open", () => {
    connected = true;
    ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));

    if (isJoinPublic && roomId){
      ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId, view:false, reservationToken } }));
      ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId } }));
    }
    setStatus("接続：OK（提出は接続時のみ）");
  });

  ws.addEventListener("close", () => {
    connected = false;
    setStatus("接続：切断（提出できません）");
  });

  ws.addEventListener("message", (ev) => {
    try{
      const m = JSON.parse(ev.data);
      if (m.t === "room_state") {
        const d = m.data || {};
        if (d.theme) theme = d.theme;
        if (typeof d.phase === "string") roomPhase = d.phase;
        if (Number.isFinite(Number(d.deadlineAt))) roomDeadlineAt = Number(d.deadlineAt);
        if (Array.isArray(d.filled) && d.filled.length === 60) filled = d.filled;
        updateLabels();
        renderTimer();

        // Phase3: lock submission after deadline / non-drawing phase
        if (!isPrivateLocal){
          const pastDeadline = roomDeadlineAt && Date.now() >= roomDeadlineAt;
          if (roomPhase && roomPhase !== "DRAWING"){
            stopTimer();
            primaryBtn.disabled = true;
            setStatus("状態：" + roomPhase + "（提出不可）");
          } else if (pastDeadline){
            stopTimer();
            primaryBtn.disabled = true;
            setStatus("締切：終了（提出不可）");
          }
        }
        if (filled[0] && !frames[0]) requestFrame(0);
        if (!isPrivateLocal && assigned>0 && filled[assigned-1] && !frames[assigned-1]) requestFrame(assigned-1);
        if (filled[cur] && !frames[cur]) requestFrame(cur);
        return;
      }
      if (m.t === "frame_data") {
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60 && typeof d.dataUrl === "string") {
          frames[i] = d.dataUrl;
          pendingFrames.delete(i);
          if (i === cur || i === cur-1) { drawFrame(cur); updateOnion(); }
        }
        return;
      }
      if (m.t === "frame_committed") {
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60) {
          filled[i] = true;
          frames[i] = null;
          if (i === cur || i === cur-1) requestFrame(i);
        }
        return;
      }
      if (m.t === "created_public") {
        const d = m.data || {};
        roomId = d.roomId;
        theme = d.theme || theme;
        if (typeof d.phase === "string") roomPhase = d.phase;
        if (Number.isFinite(Number(d.deadlineAt))) roomDeadlineAt = Number(d.deadlineAt);
        if (Array.isArray(d.filled) && d.filled.length === 60) filled = d.filled;
        updateLabels();
        renderTimer();

        const thumb = frames[0] || frames[cur] || c.toDataURL("image/png");
        // NOTE: for created public, the creator always contributes frame 0.
        addPublicWork({ roomId, theme, thumbDataUrl: thumb, myFrameIndex: 0 });
        // Save local snapshot at submit time (manual update later)
        { const dataUrl0 = (frames[0] || (()=>{ try{ return c.toDataURL("image/png"); }catch(e){ return null; } })());
          persistPublicSnapshotUpTo(roomId, 0, dataUrl0); }

        stopTimer();
        toastTitle.textContent = "終了！";
        toastText.textContent = "公開アニメを作成しました（1コマ目提出）。";
        toastMask.style.display = "flex";
        primaryBtn.disabled = true;
        return;
      }
      if (m.t === "submitted") {
        stopTimer();
        toastTitle.textContent = "終了！";
        toastText.textContent = "提出しました。";
        toastMask.style.display = "flex";
        primaryBtn.disabled = true;

        const thumb = frames[0] || null;
        if (roomId) {
          // NOTE: store which frame the user contributed, so "見る" can jump there.
          addPublicWork({ roomId, theme, thumbDataUrl: thumb, myFrameIndex: assigned });

          // Save only *my* submitted frame into local snapshot.
          // (Full snapshot is updated only when the user taps "更新" in gallery.)
          let myUrl = null;
          try{ myUrl = c.toDataURL("image/png"); }catch(e){}
          persistPublicSnapshotUpTo(roomId, assigned, myUrl);
        }
        return;
      }
      if (m.t === "error") setStatus("エラー: " + (m.data?.message || m.message || "unknown"));
    }catch(e){}
  });
}
connectIfNeeded();

// Primary actions
async function savePrivate(){
  if (isEditable()) internalDraftUpdate();
  primaryBtn.disabled = true;
  try{
    await savePrivateFrames(workId, frames);
    const thumb = frames[0] || frames[cur] || c.toDataURL("image/png");
    updateWorkMeta(workId, { thumb });
    toastTitle.textContent = "保存！";
    toastText.textContent = "プライベート作品を保存しました。";
    toastMask.style.display = "flex";
  }catch(e){
    alert("保存に失敗（容量/権限）");
  }finally{
    primaryBtn.disabled = false;
  }
}

async function primaryAction(isTimeout=false){
  if (isEditable()) internalDraftUpdate();

  if (isPrivateLocal){
    await savePrivate();
    return;
  }

  if (!ws || !connected){
    alert("サーバに接続できません（提出不可）。");
    return;
  }

  // Phase3: room-level deadline/phase guard (client-side)
  if (roomPhase && roomPhase !== "DRAWING"){
    alert("この部屋は提出を受け付けていません（" + roomPhase + "）");
    return;
  }
  if (roomDeadlineAt && Date.now() >= roomDeadlineAt){
    alert("締切を過ぎました（提出不可）");
    return;
  }

  primaryBtn.disabled = true;
  setStatus("送信中…");

  if (isCreatePublic){
    const dataUrl = frames[0] || c.toDataURL("image/png");
    ws.send(JSON.stringify({ v:1, t:"create_public_and_submit", ts:Date.now(), data:{ theme, dataUrl, isTimeout } }));
    return;
  }

  const idx = assigned;
  const dataUrl = frames[idx] || c.toDataURL("image/png");
  ws.send(JSON.stringify({ v:1, t:"submit_frame", ts:Date.now(), data:{ roomId, frameIndex: idx, dataUrl, reservationToken, isTimeout } }));
}

primaryBtn.onclick = () => primaryAction(false);

saveBtn.onclick = () => savePrivate();
gifBtn.onclick = async () => {
  if (isEditable()) internalDraftUpdate();
  const dataUrls = frames.map(x => x);
  const safeTheme = (theme || "private").replace(/[\\/:*?\"<>|]/g, "_");
  try{
    const mod = await import("./gif.js");
    if (!mod || typeof mod.exportGifFromDataUrls !== "function") throw new Error("exportGifFromDataUrls が見つかりません");
    await mod.exportGifFromDataUrls({ width:256, height:256, dataUrls, delayCs: 8, filename: `${safeTheme}.gif` });
  }catch(e){
    window.V15?.addLog?.("gif_import_failed", { message: String(e?.message || e) });
    alert("GIF機能の読み込みに失敗しました。\n（gif.js が壊れている/キャッシュが古い可能性）");
  }
};

// boot
paintWhite();
themeName.textContent = "お題：" + (theme || "-");
if (isCreatePublic && assigned < 0) assigned = 0;

primaryBtn.textContent = isPrivateLocal ? "保存" : "送信（提出）";
saveRow.style.display = isPrivateLocal ? "flex" : "none";

startTimer();
setTab("draw");
setCur(isPrivateLocal ? 0 : (assigned>=0 ? assigned : 0));

if (isPrivateLocal){
  ensurePrivateWorkFrames(workId).then((f) => {
    if (Array.isArray(f) && f.length === 60){ frames = f; drawFrame(cur); }
  });
}

if (!isPrivateLocal && assigned>=0){
  const dft = loadDraft();
  if (dft && dft.startsWith("data:image/")) { frames[assigned] = dft; if (cur === assigned) drawFrame(cur); }
}

async function waitForFrameData(i, timeoutMs){
  const t0 = Date.now();
  return await new Promise((resolve) => {
    const tick = () => {
      if (frames[i]) return resolve(true);
      if (Date.now() - t0 >= timeoutMs) return resolve(false);
      setTimeout(tick, 45);
    };
    tick();
  });
}

async function persistPublicSnapshotUpTo(roomId, frameIndex, myDataUrl){
  try{
    if (!roomId) return;
    const idx = Number(frameIndex);
    if (!Number.isFinite(idx) || idx<0 || idx>=60) return;

    const snap = Array.from({length:60}, () => null);

    // 「自分が描いた時点でのアニメ」= 自分のコマ + それ以前（0..idx-1）
    // 参加方式の都合上、idxより後が埋まることは基本的に無い（最若空き割当）
    // なので 0..idx のみ保存しておけば「勝手に最新化」もしない。
    if (!isPrivateLocal){
      const need = [];
      for (let i=0;i<idx;i++){
        if (!filled[i]) continue;
        if (!frames[i] && connected) need.push(i);
      }
      // Request missing frames in parallel to avoid long waits on the last frames.
      for (const i of need) requestFrame(i);
      await Promise.all(need.map((i) => waitForFrameData(i, 2000)));

      for (let i=0;i<idx;i++){
        if (!filled[i]) continue;
        if (frames[i]) snap[i] = frames[i];
      }
    }

    if (typeof myDataUrl === "string" && myDataUrl) snap[idx] = myDataUrl;

    await savePublicSnapshotFrames(roomId, snap);
    window.V15.addLog("pub_snapshot_saved", { roomId, upTo: idx, savedCount: snap.filter(Boolean).length });
  }catch(e){
    window.V15.addLog("pub_snapshot_save_error", { message: String(e?.message||e) });
  }
}


async function persistPublicSnapshot(roomId, theme, snapshotFrames){
  try{
    if (!roomId) return;
    // Ensure full-length array
    let frames60 = snapshotFrames;
    if (!Array.isArray(frames60) || frames60.length !== 60){
      frames60 = Array.from({length:60}, (_,i)=> snapshotFrames?.[i] ?? null);
    }
    await savePublicSnapshotFrames(roomId, frames60);
    // also keep latest thumb in meta for list UI
    const thumb = frames60[0] || null;
    // nothing else; meta is handled by addPublicWork/updateWorkMeta
    window.V15.addLog("pub_snapshot_saved", { roomId, theme, has0: !!thumb });
  }catch(e){
    window.V15.addLog("pub_snapshot_save_error", { message: String(e?.message||e) });
  }
}


