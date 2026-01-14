import { qs, clamp, loadWorkSnapshotById, buildFramesFromPairs } from "./util.js";

window.V12.ensureLogUi();

const roomId = (qs("roomId") || "").toString().toUpperCase();
const workId = (qs("workId") || "").toString();

const title = document.getElementById("title");
const sub = document.getElementById("sub");
const modeLabel = document.getElementById("modeLabel");
const slider = document.getElementById("slider");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const frameLabel = document.getElementById("frameLabel");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");

const c = document.getElementById("c");
const ctx = c.getContext("2d");

let frames = Array.from({ length: 60 }, () => null);
let fps = 12;
let cur = 0;

function drawFrame(i){
  ctx.clearRect(0,0,c.width,c.height);
  const dataUrl = frames[i];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,c.width,c.height);
    ctx.drawImage(img, 0,0,c.width,c.height);
  };
  img.src = dataUrl;
}

function setCur(i){
  cur = clamp(i, 0, 59);
  slider.value = String(cur + 1);
  frameLabel.textContent = `コマ ${cur + 1} / 60`;
  drawFrame(cur);
}

prev.onclick = () => setCur(cur - 1);
next.onclick = () => setCur(cur + 1);
slider.oninput = () => setCur(parseInt(slider.value, 10) - 1);

// playback
let playing = false;
let playTimer = null;
function stop(){
  playing = false;
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  playBtn.style.display = "block";
  stopBtn.style.display = "none";
}
function play(){
  if (playing) return;
  playing = true;
  playBtn.style.display = "none";
  stopBtn.style.display = "block";
  let i = cur;
  playTimer = setInterval(() => {
    i = (i + 1) % 60;
    setCur(i);
  }, Math.max(40, Math.floor(1000 / fps)));
}
playBtn.onclick = play;
stopBtn.onclick = stop;

// --- Snapshot mode (④) ---
if (workId) {
  const w = loadWorkSnapshotById(workId);
  if (!w) {
    modeLabel.textContent = "モード：保存（見つからない）";
    sub.textContent = "保存データが見つからない…";
  } else {
    modeLabel.textContent = "モード：保存（あなたが描いた時点）";
    title.textContent = `閲覧（保存）`;
    sub.textContent = `お題：${w.theme || "-"} / 元ID：${w.roomId}`;
    frames = buildFramesFromPairs(w.snapshotPairs, 60);
    setCur((w.myFrameIndex >= 0) ? w.myFrameIndex : 0);
  }
} else {
  // --- Live mode ---
  modeLabel.textContent = "モード：ライブ（現在の状態）";
  if (!roomId) {
    sub.textContent = "部屋IDが無い…";
    setCur(0);
  } else {
    const ws = window.V12.createLoggedWebSocket();

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
      ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId, view:true } }));
      // 念のため
      ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId } }));
    });

    ws.addEventListener("message", (ev) => {
      try{
        const m = JSON.parse(ev.data);
        if (m.t === "joined" || m.t === "room_state") {
          const d = m.data || m;
          sub.textContent = "お題：" + (d.theme || "-");
          fps = d.fps || 12;
          if (Array.isArray(d.frames)) frames = d.frames;
          setCur(cur);
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
      }catch(e){}
    });
  }
}

setCur(0);
