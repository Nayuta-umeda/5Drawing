import { qs, clamp, addMyRoom } from "./util.js";

window.V12.ensureLogUi();
window.V12.addLog("editor_init", { href: location.href });

const roomId = qs("roomId") || "";
const password = qs("password") || "";

const roomTitle = document.getElementById("roomTitle");
const themeTitle = document.getElementById("themeTitle");
const assignTitle = document.getElementById("assignTitle");
const slider = document.getElementById("slider");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const toast = document.getElementById("toast");

const c = document.getElementById("c");
const ctx = c.getContext("2d");

let frames = Array.from({length:60}, () => null);
let fps = 12;
let assigned = -1;
let theme = "-";
let cur = 0;

let tool = "pen";
let color = document.getElementById("color").value;
let size = parseInt(document.getElementById("size").value, 10);

let drawing = false;
let last = null;

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
}

function isEditable(){
  return cur === assigned && !submitted;
}

function setStatus(t){ statusEl.textContent = t; }

function drawOnion(prevIdx){
  const dataUrl = frames[prevIdx];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.save();
    ctx.globalAlpha = 0.2;
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
    // redraw (keep onion)
    ctx.clearRect(0,0,c.width,c.height);
    if (i > 0) drawOnion(i-1);
    ctx.drawImage(img,0,0,c.width,c.height);
  };
  img.src = dataUrl;
}

function setCur(i){
  cur = clamp(i, 0, 59);
  slider.value = String(cur);
  frameLabel.textContent = `${cur} / 59`;
  drawFrame(cur);

  if (cur === assigned) {
    setStatus(submitted ? "提出済み。閲覧のみ。" : "ここがあなたのコマ。描けるよ。提出はボタン or タイムアウト。");
  } else {
    setStatus("割当コマ以外は閲覧のみ。");
  }
}

function setTool(t){
  tool = t;
  document.getElementById("toolPen").classList.toggle("btnAccent", t==="pen");
  document.getElementById("toolEraser").classList.toggle("btnAccent", t==="eraser");
}

document.getElementById("toolPen").onclick = () => setTool("pen");
document.getElementById("toolEraser").onclick = () => setTool("eraser");
document.getElementById("undo").onclick = () => { if (isEditable()) undo(); };
document.getElementById("clear").onclick = () => { if (isEditable()) { snapshot(); ctx.clearRect(0,0,c.width,c.height); } };

document.getElementById("color").oninput = (e) => { color = e.target.value; };
document.getElementById("size").oninput = (e) => {
  size = parseInt(e.target.value,10);
  document.getElementById("sizeLabel").textContent = String(size);
};

prev.onclick = () => setCur(cur - 1);
next.onclick = () => setCur(cur + 1);
slider.oninput = () => setCur(parseInt(slider.value,10));

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

function onUp(ev){
  drawing = false;
  last = null;
}

c.addEventListener("pointerdown", onDown);
c.addEventListener("pointermove", onMove);
c.addEventListener("pointerup", onUp);
c.addEventListener("pointercancel", onUp);

roomTitle.textContent = roomId ? `編集（${roomId}）` : "編集";
themeTitle.textContent = "お題：-";
assignTitle.textContent = "割当：-";

let submitted = false;
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
    // timeout submit
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

function canvasToDataUrl(){
  return c.toDataURL("image/png");
}

const ws = window.V12.createLoggedWebSocket();
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  if (!roomId) {
    setStatus("部屋IDが無い…ロビーから入ってね");
    return;
  }
  ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId, password } }));
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "joined" || m.t === "room_state") {
      const d = m.data;
      theme = d.theme || "-";
      fps = d.fps || 12;
      frames = d.frames || frames;
      assigned = (typeof d.assignedFrame === "number") ? d.assignedFrame : assigned;

      themeTitle.textContent = "お題：" + theme;
      assignTitle.textContent = assigned >= 0 ? `割当：${assigned}コマ目` : "割当：-";
      addMyRoom({ roomId, theme, at: Date.now() });

      if (assigned >= 0) setCur(assigned);
      else setCur(0);

      startTimer();
    }
    if (m.t === "frame_committed") {
      // update frames
      if (typeof m.data?.frameIndex === "number") {
        frames[m.data.frameIndex] = m.data.dataUrl || frames[m.data.frameIndex];
        if (m.data.frameIndex === cur) drawFrame(cur);
      }
    }
    if (m.t === "error") {
      setStatus("エラー: " + (m.data?.message || "unknown"));
    }
  }catch(e){}
});

function submitFrame(isTimeout=false){
  if (submitted) return;
  if (assigned < 0) { setStatus("割当が無い…"); return; }
  if (!isEditable() && !isTimeout) { setStatus("今のコマは編集できない"); return; }
  const dataUrl = canvasToDataUrl();
  submitted = true;
  stopTimer();
  setStatus("送信中…");
  ws.send(JSON.stringify({ v:1, t:"submit_frame", ts:Date.now(), data:{ roomId, frameIndex: assigned, dataUrl, isTimeout } }));
}

document.getElementById("submit").onclick = () => submitFrame(false);

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "submitted") {
      setStatus("送信完了！");
      toast.style.display = "block";
    }
  }catch(e){}
});

setTool("pen");
document.getElementById("sizeLabel").textContent = String(size);
setCur(0);
