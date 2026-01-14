import { qs, clamp, addMyRoom, saveWorkSnapshot } from "./util.js";

window.V12.ensureLogUi();
window.V12.addLog("editor_init", { href: location.href });

const roomId = (qs("roomId") || "").toString().toUpperCase();
const password = (qs("password") ?? qs("pass") ?? "").toString();
const mode = (qs("mode") || "").toString(); // "private" なら全コマ編集
const isPrivateMode = mode === "private";

const themeName = document.getElementById("themeName");
const roomIdLabel = document.getElementById("roomIdLabel");
const assignedLabel = document.getElementById("assignedLabel");
const viewingLabel = document.getElementById("viewingLabel");
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
  if (submitted) return false;
  if (isPrivateMode) return true;
  return cur === assigned;
}

// --- internal draft autosave (per stroke end) ---
function draftKey(frameIndex){
  const a = isPrivateMode ? `p${frameIndex}` : (assigned >= 0 ? `a${assigned}` : "x");
  return `anim5s_draft_v13:${roomId}:${a}`;
}
function saveDraft(frameIndex, dataUrl){
  try{ sessionStorage.setItem(draftKey(frameIndex), dataUrl); }catch(e){}
}
function loadDraft(frameIndex){
  try{ return sessionStorage.getItem(draftKey(frameIndex)); }catch(e){ return null; }
}
function internalUpdateDraft(){
  if (!isEditable()) return;
  const idx = isPrivateMode ? cur : assigned;
  if (idx < 0) return;

  const dataUrl = c.toDataURL("image/png");
  frames[idx] = dataUrl;
  saveDraft(idx, dataUrl);
  window.V12.addLog("draft_updated", { frame: idx + 1, bytes: dataUrl.length, mode: isPrivateMode ? "private" : "public" });
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
  // onion skin: previous frame（public編集時だけ）
  if (!isPrivateMode && i > 0) drawOnion(i-1);

  const dataUrl = frames[i];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,c.width,c.height);
    if (!isPrivateMode && i > 0) drawOnion(i-1);
    ctx.drawImage(img,0,0,c.width,c.height);
  };
  img.src = dataUrl;
}

function updateLabels(){
  const shown = cur + 1;
  viewingLabel.textContent = `${shown} / 60`;
  frameLabel.textContent = `コマ ${shown} / 60`;

  // ②：担当コマと閲覧コマが同じなら強調
  const same = (!isPrivateMode && assigned >= 0 && cur === assigned);
  viewingLabel.style.fontWeight = same ? "900" : "700";
  viewingLabel.style.color = same ? "var(--text)" : "var(--muted)";
}

function setCur(i){
  cur = clamp(i, 0, 59);
  const shown = cur + 1;
  viewSlider.value = String(shown);
  updateLabels();
  drawFrame(cur);

  if (isPrivateMode) {
    setStatus("プライベート編集：どのコマでも描けるよ。保存は「保存」ボタン。");
    return;
  }

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
    if (!submitted && !isPrivateMode && assigned >= 0) submitFrame(true);
  }
}
function startTimer(){
  if (isPrivateMode) {
    // プライベートは制限なし（④）
    timerEl.textContent = "制限なし";
    return;
  }
  if (timerId) return;
  timerId = setInterval(tick, 200);
}
function stopTimer(){
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

// --- networking ---
const ws = window.V12.createLoggedWebSocket();

function applyStateLike(d){
  theme = d.theme || theme;
  fps = d.fps || fps;

  if (!isPrivateMode) {
    if (typeof d.assignedFrame === "number") assigned = d.assignedFrame;
    if (typeof d.assigned === "number") assigned = d.assigned;
  }

  if (Array.isArray(d.frames) && typeof d.frames[0] === "string") frames = d.frames;

  // draft restore
  if (isPrivateMode) {
    const dft = loadDraft(cur);
    if (dft && !frames[cur]) frames[cur] = dft;
  } else if (assigned >= 0 && !frames[assigned]) {
    const dft = loadDraft(assigned);
    if (dft && dft.startsWith("data:image/png")) {
      frames[assigned] = dft;
      window.V12.addLog("draft_restored", { frame: assigned + 1, bytes: dft.length });
    }
  }

  themeName.textContent = "お題：" + (theme || "-");
  roomIdLabel.textContent = roomId || "-";
  if (isPrivateMode) {
    assignedLabel.textContent = "ALL（自由）";
    submitBtn.textContent = "保存";
  } else {
    assignedLabel.textContent = (assigned >= 0) ? `${assigned + 1} / 60` : "-";
    submitBtn.textContent = "送信（提出）";
  }

  addMyRoom({ roomId, theme, at: Date.now() });

  setCur(isPrivateMode ? cur : ((assigned >= 0) ? assigned : 0));
  startTimer();
  updateLabels();
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
    data:{ roomId, password, pass: password, view: false, mode: isPrivateMode ? "private" : "public" }
  }));
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);

    if (m.t === "joined" || m.t === "room_state") {
      const d = m.data || m;
      applyStateLike(d);
      return;
    }
    if (m.t === "frame_committed") {
      const d = m.data || m;
      if (typeof d.frameIndex === "number" && typeof d.dataUrl === "string") {
        frames[d.frameIndex] = d.dataUrl;
        if (d.frameIndex === cur) drawFrame(cur);
      }
      return;
    }
    if (m.t === "submitted") {
      submitted = !isPrivateMode; // privateは何度でも保存
      if (!isPrivateMode) {
        submitBtn.disabled = true;
        toast.style.display = "flex";
      } else {
        setStatus("保存しました。別のコマも編集できるよ。");
        submitBtn.disabled = false;
      }
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
  if (!roomId) return;
  if (!isPrivateMode && submitted) return;

  // 送信前に最後の内部更新を確実に
  if (isEditable()) internalUpdateDraft();

  const frameIndex = isPrivateMode ? cur : assigned;
  if (frameIndex < 0) { setStatus("担当コマが無い…"); return; }

  const dataUrl = frames[frameIndex] || c.toDataURL("image/png");

  if (!isPrivateMode) {
    submitted = true;
    stopTimer();
    setStatus("送信中…");
    submitBtn.disabled = true;
  } else {
    setStatus("保存中…");
    submitBtn.disabled = true;
  }

  ws.send(JSON.stringify({
    v:1, t:"submit_frame", ts:Date.now(),
    data:{
      roomId,
      frameIndex,
      dataUrl,
      password, // private auth
      isTimeout
    }
  }));

  // ④：自分の作品に「描いた時点の状態」を保存（publicのときだけ）
  if (!isPrivateMode) {
    try{
      saveWorkSnapshot({ roomId, theme, frames, myFrameIndex: frameIndex });
    }catch(e){}
  }
}
submitBtn.onclick = () => submitFrame(false);

// boot UI
themeName.textContent = "お題：-";
roomIdLabel.textContent = roomId || "-";
assignedLabel.textContent = "-";
timerEl.textContent = isPrivateMode ? "制限なし" : "残り 03:00";
setTool("pen");
setTab("draw");
setCur(0);
updateLabels();
