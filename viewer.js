import { qs, clamp } from "./util.js";

window.V12.ensureLogUi();

const roomId = qs("roomId") || "";
const title = document.getElementById("title");
const sub = document.getElementById("sub");
const slider = document.getElementById("slider");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");

const c = document.getElementById("c");
const ctx = c.getContext("2d");

let frames = Array.from({length:60}, () => null);
let fps = 12;
let playing = false;
let playTimer = null;
let cur = 0;

function drawFrame(i){
  ctx.clearRect(0,0,c.width,c.height);
  const dataUrl = frames[i];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,c.width,c.height);
    ctx.drawImage(img,0,0,c.width,c.height);
  };
  img.src = dataUrl;
}

function setCur(i){
  cur = clamp(i, 0, 59);
  slider.value = String(cur);
  frameLabel.textContent = `${cur} / 59`;
  drawFrame(cur);
}

function start(){
  if (playing) return;
  playing = true;
  playBtn.style.display = "none";
  stopBtn.style.display = "block";
  let t0 = performance.now();
  let idx0 = cur;
  const step = () => {
    if (!playing) return;
    const t = performance.now() - t0;
    const f = Math.floor(t / (1000 / fps));
    setCur((idx0 + f) % 60);
    playTimer = requestAnimationFrame(step);
  };
  playTimer = requestAnimationFrame(step);
}

function stop(){
  playing = false;
  playBtn.style.display = "block";
  stopBtn.style.display = "none";
  if (playTimer) cancelAnimationFrame(playTimer);
  playTimer = null;
}

prev.onclick = () => setCur(cur - 1);
next.onclick = () => setCur(cur + 1);
slider.oninput = () => setCur(parseInt(slider.value,10));
playBtn.onclick = start;
stopBtn.onclick = stop;

title.textContent = roomId ? `閲覧（${roomId}）` : "閲覧";
sub.textContent = "お題：-";

const ws = window.V12.createLoggedWebSocket();
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId } }));
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "room_state") {
      const d = m.data || m;
      sub.textContent = "お題：" + (d.theme || "-");
      fps = d.fps || 12;
      // frames が来るサーバだけ反映
      if (Array.isArray(d.frames) && typeof d.frames[0] === "string") frames = d.frames;
      setCur(cur);
    }
  }catch(e){}
});

setCur(0);
