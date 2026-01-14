import { qs, clamp } from "./util.js";

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const roomId = (qs("roomId") || "").toString().toUpperCase();
const themeQ = (qs("theme") || "").toString();

const sub = document.getElementById("sub");
const net = document.getElementById("net");
const slider = document.getElementById("slider");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");

const c = document.getElementById("c");
const ctx = c.getContext("2d");

let filled = Array.from({length:60}, ()=>false);
let cache = Array.from({length:60}, ()=>null);
let cur = 0;

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
  cur = clamp(i,0,59);
  slider.value = String(cur+1);
  frameLabel.textContent = `コマ ${cur+1} / 60`;
  drawFrame(cur);
  if (filled[cur] && !cache[cur]) requestFrame(cur);
}

prev.onclick = () => setCur(cur-1);
next.onclick = () => setCur(cur+1);
slider.oninput = () => setCur(parseInt(slider.value,10)-1);

paintWhite();

let ws = null;
let connected = false;
const pending = new Set();

function requestFrame(i){
  if (!ws || !connected) return;
  if (pending.has(i)) return;
  pending.add(i);
  ws.send(JSON.stringify({ v:1, t:"get_frame", ts:Date.now(), data:{ roomId, frameIndex:i } }));
}

if (!roomId){
  sub.textContent = "お題：-";
  net.textContent = "接続：部屋IDなし";
  setCur(0);
} else {
  sub.textContent = "お題：" + (themeQ || "-");
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
        if (Array.isArray(d.filled) && d.filled.length === 60) filled = d.filled;
        net.textContent = "接続：OK";
        if (filled[0] && !cache[0]) requestFrame(0);
        if (filled[cur] && !cache[cur]) requestFrame(cur);
      }
      if (m.t === "frame_data") {
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60 && typeof d.dataUrl === "string") {
          cache[i] = d.dataUrl;
          pending.delete(i);
          if (i === cur) drawFrame(cur);
        }
      }
      if (m.t === "frame_committed") {
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60) {
          filled[i] = true;
          cache[i] = null;
          if (i === cur) requestFrame(i);
        }
      }
      if (m.t === "error") net.textContent = "接続：エラー";
    }catch(e){}
  });

  ws.addEventListener("close", () => {
    connected = false;
    net.textContent = "接続：切断";
  });

  setCur(0);
}
