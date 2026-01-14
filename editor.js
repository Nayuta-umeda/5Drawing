import { qs, clamp, addMyRoom } from "./util.js";

window.V12.ensureLogUi();
window.V12.addLog("editor_init", { href: location.href });

const roomId = (qs("roomId") || "").toString().toUpperCase();
const password = (qs("password") ?? qs("pass") ?? "").toString();
let reservationToken = (qs("token") ?? qs("reservationToken") ?? "").toString();

const themeName = document.getElementById("themeName");
const roomIdLabel = document.getElementById("roomIdLabel");
const assignedLabel = document.getElementById("assignedLabel");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit");
const toast = document.getElementById("toast");

// Tabs
const tabDraw = document.getElementById("tabDraw");
const tabView = document.getElementById("tabView");
const panelDraw = document.getElementById("panelDraw");
const panelView = document.getElementById("panelView");

// View controls
const viewSlider = document.getElementById("viewSlider");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");

// Draw controls
const toolPen = document.getElementById("toolPen");
const toolEraser = document.getElementById("toolEraser");
const undoBtn = document.getElementById("undo");
const clearBtn = document.getElementById("clear");
const sizeEl = document.getElementById("size");
const sizeVal = document.getElementById("sizeVal");
const paletteEl = document.getElementById("palette");

// Canvas
const c = document.getElementById("c");
const ctx = c.getContext("2d");

// State
let frames = Array.from({ length: 60 }, () => null); // dataURL (null ok)
let fps = 12;
let assigned = Number(qs("assigned") ?? -1); // 0-based
if (!Number.isFinite(assigned)) assigned = -1;
let theme = "-";
let cur = 0; // 0-based

let submitted = false;
let tool = "pen";
let color = "#1f2937";
let size = 6;

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
  ctx.putImageData(img, 0, 0);
  internalUpdateDraft();
}

function setStatus(t){ statusEl.textContent = t; }

function isEditable(){
  return cur === assigned && !submitted;
}

// --- internal draft autosave (per stroke end) ---
function draftKey(){
  const a = (assigned >= 0) ? assigned : "x";
  return `anim5s_draft_v12:${roomId}:${a}`;
}
function saveDraft(dataUrl){
  try{ sessionStorage.setItem(draftKey(), dataUrl); }catch(e){}
}
function loadDraft(){
  try{ return sessionStorage.getItem(draftKey()); }catch(e){ return null; }
}
function internalUpdateDraft(){
  // 「手を離すたびに内部更新」：表示用 frames を更新し、sessionStorage に保存
  if (assigned < 0) return;
  if (!isEditable()) return;
  const dataUrl = c.toDataURL("image/png");
  frames[assigned] = dataUrl;
  saveDraft(dataUrl);
  window.V12.addLog("draft_updated", { frame: assigned + 1, bytes: dataUrl.length });
}

function drawOnion(prevIdx){
  const dataUrl = frames[prevIdx];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(img, 0,0,c.width,c.height);
    ctx.restore();
  };
  img.src = dataUrl;
}

function drawFrame(i){
  ctx.clearRect(0,0,c.width,c.height);
  // onion skin: previous frame
  if (i > 0) drawOnion(i-1);
  const dataUrl = frames[i];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,c.width,c.height);
    if (i > 0) drawOnion(i-1);
    ctx.drawImage(img,0,0,c.width,c.height);
  };
  img.src = dataUrl;
}

function setCur(i){
  cur = clamp(i, 0, 59);
  // 1..60 表示
  const shown = cur + 1;
  viewSlider.value = String(shown);
  frameLabel.textContent = `コマ ${shown} / 60`;
  drawFrame(cur);

  if (cur === assigned) {
    setStatus(submitted ? "提出済み。閲覧のみ。" : "担当コマです。描けます（提出は送信 or タイムアウト）。");
  } else {
    setStatus("担当コマ以外は閲覧のみ。");
  }
}

function setTab(name){
  const draw = name === "draw";
  tabDraw.classList.toggle("active", draw);
  tabView.classList.toggle("active", !draw);
  panelDraw.classList.toggle("hidden", !draw);
  panelView.classList.toggle("hidden", draw);
  // 「見る」では描画を抑制（誤タップ対策）
  c.style.pointerEvents = draw ? "auto" : "none";
}
tabDraw.onclick = () => setTab("draw");
tabView.onclick = () => setTab("view");

// --- palette UI ---
function renderPalette(){
  paletteEl.innerHTML = "";
  PALETTE.forEach((p) => {
    const b = document.createElement("button");
    b.className = "swatch" + (p.v === color ? " sel" : "");
    b.style.background = p.v;
    b.title = p.name;
    b.onclick = () => {
      color = p.v;
      renderPalette();
    };
    paletteEl.appendChild(b);
  });
}
renderPalette();

// --- tool UI ---
function setTool(t){
  tool = t;
  toolPen.classList.toggle("on", t === "pen");
  toolEraser.classList.toggle("on", t === "eraser");
}
toolPen.onclick = () => setTool("pen");
toolEraser.onclick = () => setTool("eraser");

sizeEl.value = String(size);
sizeVal.textContent = String(size);
sizeEl.oninput = () => {
  size = parseInt(sizeEl.value, 10);
  sizeVal.textContent = String(size);
};

undoBtn.onclick = () => { if (isEditable()) undo(); };
clearBtn.onclick = () => {
  if (!isEditable()) return;
  snapshot();
  ctx.clearRect(0,0,c.width,c.height);
  internalUpdateDraft();
};

// --- drawing ---
let drawing = false;
let last = null;

function posFromEvent(ev){
  const rect = c.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (c.width / rect.width);
  const y = (ev.clientY - rect.top) * (c.height / rect.height);
  return { x, y };
}

function stroke(p0, p1){
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;

  if (tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
  }

  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
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
  if (last) stroke(last, p);
  last = p;
}

function onUp(){
  if (!drawing) return;
  drawing = false;
  last = null;
  // ✅ 手を離すたびに内部更新
  internalUpdateDraft();
}

c.addEventListener("pointerdown", onDown);
c.addEventListener("pointermove", onMove);
c.addEventListener("pointerup", onUp);
c.addEventListener("pointercancel", onUp);

// --- view controls (1..60) ---
viewSlider.oninput = () => setCur(parseInt(viewSlider.value, 10) - 1);
prevBtn.onclick = () => setCur(cur - 1);
nextBtn.onclick = () => setCur(cur + 1);

// --- timer (3 minutes) ---
let timerLeftMs = 3 * 60 * 1000;
let timerId = null;

function fmt(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}
function tick(){
  timerLeftMs -= 200;
  timerEl.textContent = "残り " + fmt(timerLeftMs);
  if (timerLeftMs <= 0) {
    timerLeftMs = 0;
    timerEl.textContent = "残り 00:00";
    stopTimer();
    if (!submitted && assigned >= 0) submitFrame(true);
  }
}
function startTimer(){
  if (timerId) return;
  timerId = setInterval(tick, 200);
}
function stopTimer(){
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

// --- networking (compat) ---
const ws = window.V12.createLoggedWebSocket();

function applyJoinedPayload(p){
  theme = p.theme || theme;
  fps = p.fps || fps;

  if (typeof p.assignedFrame === "number") assigned = p.assignedFrame;
  if (typeof p.assigned === "number") assigned = p.assigned;

  if (p.reservationToken) reservationToken = String(p.reservationToken);
  if (p.token) reservationToken = String(p.token);

  // frames が dataUrl 配列で来るサーバだけ反映（別サーバは filled:boolean[] のことがある）
  if (Array.isArray(p.frames) && typeof p.frames[0] === "string") frames = p.frames;
  if (p.data && Array.isArray(p.data.frames)) {
    const fr = p.data.frames;
    if (typeof fr[0] === "string") frames = fr;
  }

  // draft restore (only if not already have frame)
  if (assigned >= 0 && !frames[assigned]) {
    const d = loadDraft();
    if (d && d.startsWith("data:image/png")) {
      frames[assigned] = d;
      window.V12.addLog("draft_restored", { frame: assigned + 1, bytes: d.length });
    }
  }

  themeName.textContent = "お題：" + (theme || "-");
  roomIdLabel.textContent = roomId || "-";
  assignedLabel.textContent = (assigned >= 0) ? `${assigned + 1} / 60` : "-";

  addMyRoom({ roomId, theme, at: Date.now() });

  setCur((assigned >= 0) ? assigned : 0);
  startTimer();
}

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  if (!roomId) {
    setStatus("部屋IDが無い…ロビーから入ってね");
    submitBtn.disabled = true;
    return;
  }
  ws.send(JSON.stringify({
    v:1, t:"join_room", ts:Date.now(),
    data:{ roomId, password, pass: password, token: reservationToken, reservationToken }
  }));
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);

    if (m.t === "room_joined") { applyJoinedPayload(m); return; }
    if (m.t === "joined" || m.t === "room_state") {
      const d = m.data || m;
      applyJoinedPayload(d);
      return;
    }

    if (m.t === "frame_committed") {
      if (typeof m.data?.frameIndex === "number") {
        frames[m.data.frameIndex] = m.data.dataUrl || frames[m.data.frameIndex];
        if (m.data.frameIndex === cur) drawFrame(cur);
      }
      return;
    }

    if (m.t === "submitted") {
      submitted = true;
      submitBtn.disabled = true;
      toast.style.display = "flex";
      return;
    }

    if (m.t === "error") {
      setStatus("エラー: " + (m.data?.message || m.message || "unknown"));
      return;
    }
  }catch(e){}
});

// --- submit (button or timeout) ---
function submitFrame(isTimeout=false){
  if (submitted) return;
  if (assigned < 0) { setStatus("担当コマが無い…"); return; }

  // 送信前に最後の内部更新を確実に
  if (isEditable()) internalUpdateDraft();

  const dataUrl = frames[assigned] || c.toDataURL("image/png");
  submitted = true;
  stopTimer();
  setStatus("送信中…");
  submitBtn.disabled = true;

  ws.send(JSON.stringify({
    v:1, t:"submit_frame", ts:Date.now(),
    data:{
      roomId,
      frameIndex: assigned,
      dataUrl,
      pngDataUrl: dataUrl,
      imageDataUrl: dataUrl,
      reservationToken,
      token: reservationToken,
      isTimeout
    }
  }));
}
submitBtn.onclick = () => submitFrame(false);

// boot UI
themeName.textContent = "お題：-";
roomIdLabel.textContent = roomId || "-";
assignedLabel.textContent = "-";
timerEl.textContent = "残り 03:00";
setTool("pen");
setTab("draw");
setCur(0);
