
import { CFG, $, makeToast, getWsBase, wsUrlFromBase, loadPendingAction, clearPendingAction, touchMyRoom } from "./common.js";

const say = makeToast();

// ===== 内部ログ（ユーザーには見せない） =====
const internalLog=[];
function log(type,data){
  internalLog.push({t:Date.now(),type,data});
  if(internalLog.length>5000) internalLog.splice(0,1000);
}

// ===== UI =====
const themeLine=$("themeLine");
const chipRoom=$("chipRoom");
const chipKoma=$("chipKoma");
const badge=$("badge");
const stage=$("stage");

const netDot=$("netDot");
const netText=$("netText");

function setNet(ok, msg){
  netDot.classList.toggle("on", ok);
  netDot.classList.toggle("off", !ok);
  netText.textContent = msg || (ok ? "通信: ON" : "通信: OFF");
}

// ===== Canvas =====
const W=CFG.W, H=CFG.H, FRAME_COUNT=CFG.FRAME_COUNT, FPS=CFG.FPS;
const cDraw=$("draw"), cOnion=$("onion"), cPlay=$("play");
cDraw.width=cOnion.width=cPlay.width=W;
cDraw.height=cOnion.height=cPlay.height=H;

const ctx=cDraw.getContext("2d",{alpha:false});
const octx=cOnion.getContext("2d",{alpha:true});
const pctx=cPlay.getContext("2d",{alpha:false});

function fillWhite(tctx){
  tctx.save();
  tctx.setTransform(1,0,0,1,0,0);
  tctx.globalCompositeOperation="source-over";
  tctx.fillStyle="#fff";
  tctx.fillRect(0,0,W,H);
  tctx.restore();
}

// ===== 状態 =====
const state={
  wsBase: getWsBase(),
  room:null,
  frames:Array.from({length:FRAME_COUNT},()=>({filled:false,img:null,url:null})),
  localDraft:Array.from({length:FRAME_COUNT},()=>null),
  currentFrame:0,
  tool:"pen",
  color:"#141425",
  size:6,
  onion:true,
  loop:false,
  playing:false,
  playFrame:0,
  dirty:false,
  submitted:false,
  autoSubmitAt:0,
};

const draftCache=new Map(); // idx->Image

function resetFrames(){
  for(const f of state.frames){
    if(f.url) URL.revokeObjectURL(f.url);
    f.filled=false; f.img=null; f.url=null;
  }
  state.localDraft.fill(null);
  draftCache.clear();
  state.currentFrame=0;
  state.dirty=false;
  state.submitted=false;
  state.autoSubmitAt=0;
  fillWhite(ctx); octx.clearRect(0,0,W,H); fillWhite(pctx);
  renderKoma();
}

function loadLocalDraftsForRoom(roomId){
  for(let i=0;i<FRAME_COUNT;i++){
    const key=`anim5s_room_${roomId}_frame_${i}`;
    const v=localStorage.getItem(key);
    state.localDraft[i]=v||null;
  }
  draftCache.clear();
}

function saveLocalDraft(){
  if(!state.room) return;
  const idx=state.currentFrame;
  try{
    let url="";
    try{ url=cDraw.toDataURL("image/webp", 0.82); }
    catch{ url=cDraw.toDataURL("image/png"); }
    state.localDraft[idx]=url;
    draftCache.delete(idx);
    localStorage.setItem(`anim5s_room_${state.room.roomId}_frame_${idx}`, url);
    log("autosave",{roomId:state.room.roomId, frame:idx});
  }catch(e){
    log("autosave_fail", String(e));
  }
}

function clearLocalDraftsForRoom(roomId){
  for(let i=0;i<FRAME_COUNT;i++){
    localStorage.removeItem(`anim5s_room_${roomId}_frame_${i}`);
  }
  say("消した");
}

function getBestImage(idx){
  const f=state.frames[idx];
  if(f && f.img) return f.img;
  const cached=draftCache.get(idx);
  if(cached) return cached;
  const url=state.localDraft[idx];
  if(url){
    const im=new Image();
    im.decoding="async";
    im.src=url;
    draftCache.set(idx, im);
    return im;
  }
  return null;
}

function renderOnion(){
  octx.clearRect(0,0,W,H);
  if(!state.onion) return;
  const prev=state.currentFrame-1;
  if(prev<0) return;
  const img=getBestImage(prev);
  if(!img) return;
  octx.save();
  octx.globalAlpha = CFG.ONION_OPACITY;
  octx.drawImage(img,0,0,W,H);
  octx.restore();
}

function drawFrameToMain(idx){
  fillWhite(ctx);
  const img=getBestImage(idx);
  if(img) ctx.drawImage(img,0,0,W,H);
  state.dirty=false;
  renderOnion();
  renderKoma();
}

// ===== ヘッダー =====
function renderRoomHeader(){
  if(!state.room){
    themeLine.textContent="お題：-";
    chipRoom.style.display="none";
    chipKoma.textContent="コマ -";
    badge.textContent="準備中";
    return;
  }
  themeLine.textContent=`お題：${state.room.theme}`;
  chipRoom.style.display="inline-flex";
  chipRoom.textContent=`ID ${state.room.roomId}`;
}

function renderKoma(){
  const r=state.room;
  if(!r){
    chipKoma.textContent="コマ -";
    return;
  }
  if(r.canEdit==="assigned"){
    const n=(r.assignedFrame??0)+1;
    let left = 0;
    if(state.autoSubmitAt) left = Math.max(0, Math.ceil((state.autoSubmitAt-Date.now())/1000));
    chipKoma.textContent = `あなたのコマ ${n}` + (left?` / ${left}s`:"");
    badge.textContent = `コマ ${n}`;
  }else if(r.canEdit==="view"){
    chipKoma.textContent="見るだけ";
    badge.textContent="見るだけ";
  }else{
    chipKoma.textContent=`コマ ${state.currentFrame+1} / ${FRAME_COUNT}`;
    badge.textContent=`コマ ${state.currentFrame+1} / ${FRAME_COUNT}`;
  }
}

// ===== 入力（線が途切れにくい） =====
let drawing=false, lastX=0, lastY=0;
let strokePts=[]; // [[x,y],...]
const undoStack=[];

function pushUndo(){
  try{
    undoStack.push(ctx.getImageData(0,0,W,H));
    if(undoStack.length>25) undoStack.shift();
  }catch{}
}
function setTool(t){
  state.tool=t;
  $("penBtn").className = "btn " + (t==="pen"?"ok":"sub");
  $("eraserBtn").className = "btn " + (t==="erase"?"ok":"sub");
}
function canEditNow(){
  const r=state.room;
  if(!r) return false;
  if(r.canEdit==="view") return false;
  if(r.canEdit==="assigned") return state.currentFrame===r.assignedFrame;
  return true;
}
function toCanvasXY(ev){
  const r=cDraw.getBoundingClientRect();
  const x=(ev.clientX-r.left)/r.width*W;
  const y=(ev.clientY-r.top)/r.height*H;
  return {x:Math.max(0,Math.min(W,x)), y:Math.max(0,Math.min(H,y))};
}
function paintPoint(x,y){
  ctx.save();
  ctx.globalCompositeOperation="source-over";
  ctx.fillStyle = (state.tool==="erase") ? "#ffffff" : state.color;
  ctx.beginPath();
  ctx.arc(x,y,state.size/2,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}
function drawLine(ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay;
  const dist=Math.hypot(dx,dy);
  const step=Math.max(1, Math.floor(dist/1.2));
  for(let i=1;i<=step;i++){
    const t=i/step;
    paintPoint(ax+dx*t, ay+dy*t);
  }
}
function addStrokePoint(x,y){
  strokePts.push([x|0, y|0]);
  if(strokePts.length>1400){
    strokePts = strokePts.filter((_,i)=>i%2===0);
  }
}

// pointer
cDraw.addEventListener("pointerdown",(ev)=>{
  if(!canEditNow()) return;
  drawing=true;
  strokePts=[];
  pushUndo();
  const p=toCanvasXY(ev);
  lastX=p.x; lastY=p.y;
  paintPoint(lastX,lastY);
  addStrokePoint(lastX,lastY);
  state.dirty=true;
  cDraw.setPointerCapture(ev.pointerId);
});
cDraw.addEventListener("pointermove",(ev)=>{
  if(!drawing) return;
  if(!canEditNow()) return;
  const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
  for(const e of events){
    const p=toCanvasXY(e);
    drawLine(lastX,lastY,p.x,p.y);
    lastX=p.x; lastY=p.y;
    addStrokePoint(lastX,lastY);
  }
  state.dirty=true;
});

async function endStroke(ev){
  if(!drawing) return;
  drawing=false;
  try{ cDraw.releasePointerCapture(ev.pointerId); }catch{}
  saveLocalDraft();
  renderOnion();

  // ② 指を離した時は「提出」しない。ログだけ送る。
  sendStrokeLog();
}
cDraw.addEventListener("pointerup", endStroke);
cDraw.addEventListener("pointercancel", endStroke);

// ===== 道具UI =====
$("color").addEventListener("input",(e)=>state.color=e.target.value);
$("size").addEventListener("input",(e)=>{
  state.size=Number(e.target.value);
  $("w").textContent=String(state.size);
});
$("w").textContent=String(state.size);

$("penBtn").addEventListener("click",()=>setTool("pen"));
$("eraserBtn").addEventListener("click",()=>setTool("erase"));

$("undoBtn").addEventListener("click",()=>{
  if(!canEditNow()) return;
  const img=undoStack.pop();
  if(!img) return;
  ctx.putImageData(img,0,0);
  state.dirty=true;
  saveLocalDraft();
  renderOnion();
});
$("clearBtn").addEventListener("click",()=>{
  if(!canEditNow()) return;
  pushUndo();
  fillWhite(ctx);
  state.dirty=true;
  saveLocalDraft();
  renderOnion();
});
$("onionBtn").addEventListener("click",()=>{
  state.onion=!state.onion;
  $("onionBtn").textContent = state.onion ? "前: ON" : "前: OFF";
  renderOnion();
});

// ② 提出はここだけ（送信ボタン）
$("sendBtn").addEventListener("click",()=>submitCurrentFrame(false));

// ===== コマ操作（プライベートだけ） =====
const slider=$("slider");
function applyFrameChange(){
  if(!state.room) return;
  if(state.room.canEdit!=="any") return;
  if(state.dirty) saveLocalDraft();
  state.currentFrame=Number(slider.value);
  drawFrameToMain(state.currentFrame);
}
slider.addEventListener("input", applyFrameChange);
function stepFrame(d){
  if(!state.room) return;
  if(state.room.canEdit!=="any") return;
  if(state.dirty) saveLocalDraft();
  state.currentFrame=Math.max(0, Math.min(FRAME_COUNT-1, state.currentFrame+d));
  slider.value=String(state.currentFrame);
  drawFrameToMain(state.currentFrame);
}
$("prevBtn").addEventListener("click",()=>stepFrame(-1));
$("nextBtn").addEventListener("click",()=>stepFrame( 1));

$("syncBtn").addEventListener("click",()=>{
  if(!state.room){ say("部屋なし"); return; }
  sendJson({t:"resync", roomId: state.room.roomId});
  say("同期");
});

// ===== 再生（止めたコマで止まる） =====
let playTimer=null;
function drawPlayFrame(i){
  fillWhite(pctx);
  const img=getBestImage(i);
  if(img) pctx.drawImage(img,0,0,W,H);
}
function startPlayback(){
  if(!state.room) return;
  state.playing=true;
  stage.classList.add("preview");
  state.playFrame=state.currentFrame;
  drawPlayFrame(state.playFrame);
  clearInterval(playTimer);
  playTimer=setInterval(()=>{
    if(!state.playing) return;
    state.playFrame++;
    if(state.playFrame>=FRAME_COUNT){
      if(state.loop) state.playFrame=0;
      else { stopPlayback(); return; }
    }
    drawPlayFrame(state.playFrame);
  }, Math.round(1000/FPS));
}
function stopPlayback(){
  state.playing=false;
  clearInterval(playTimer);
  playTimer=null;
  state.currentFrame=state.playFrame;
  slider.value=String(state.currentFrame);
  stage.classList.remove("preview");
  drawFrameToMain(state.currentFrame);
}
$("playBtn").addEventListener("click",()=>startPlayback());
$("stopBtn").addEventListener("click",()=>stopPlayback());
$("loopBtn").addEventListener("click",()=>{
  state.loop=!state.loop;
  $("loopBtn").textContent= state.loop ? "くり返し: ON" : "くり返し: OFF";
});

// GIF保存
$("saveGifBtn").addEventListener("click", async ()=>{
  if(!window.GIF){ say("GIF読込中"); return; }
  try{
    say("GIF作成中…", 2000);
    const tmp=document.createElement("canvas");
    tmp.width=W; tmp.height=H;
    const tctx=tmp.getContext("2d",{alpha:false});
    const gif=new GIF({workers:2, quality:10, width:W, height:H});
    for(let i=0;i<FRAME_COUNT;i++){
      fillWhite(tctx);
      const img=getBestImage(i);
      if(img) tctx.drawImage(img,0,0,W,H);
      gif.addFrame(tctx,{copy:true, delay: Math.round(1000/FPS)});
    }
    gif.on("finished",(blob)=>{
      const a=document.createElement("a");
      const url=URL.createObjectURL(blob);
      a.href=url;
      const rid=state.room?.roomId || "anim";
      a.download=`5s_anim_${rid}.gif`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
      say("保存した");
    });
    gif.render();
  }catch(e){
    log("gif_fail", String(e));
    say("GIF失敗");
  }
});

// ===== 便利 =====
$("copyIdBtn").addEventListener("click", async ()=>{
  const rid=state.room?.roomId;
  if(!rid){ say("部屋なし"); return; }
  try{
    await navigator.clipboard.writeText(rid);
    say("コピー");
  }catch{
    const t=document.createElement("textarea");
    t.value=rid; document.body.appendChild(t);
    t.select(); document.execCommand("copy");
    t.remove(); say("コピー");
  }
});
$("clearLocalBtn").addEventListener("click",()=>{
  if(!state.room){ say("部屋なし"); return; }
  clearLocalDraftsForRoom(state.room.roomId);
});

// ===== WebSocket =====
let ws=null;
let pendingBinary=null;
let joinInFlight=false;
let reconnectTimer=null;
let reconnectTry=0;
let keepaliveTimer=null;

function sendJson(obj){
  if(!ws || ws.readyState!==1) return false;
  try{ ws.send(JSON.stringify(obj)); return true; }catch{ return false; }
}

function scheduleReconnect(){
  if(reconnectTimer) return;
  const delay = Math.min(30_000, 900 * (2 ** reconnectTry));
  reconnectTry = Math.min(6, reconnectTry+1);
  setNet(false, `通信: 再接続 ${Math.round(delay/1000)}s`);
  reconnectTimer = setTimeout(()=>{ reconnectTimer=null; connect(); }, delay);
}

function startKeepalive(){
  clearInterval(keepaliveTimer);
  keepaliveTimer = setInterval(()=>{
    sendJson({t:"ping", ts:Date.now()});
  }, 15_000);
}

function connect(){
  const base = (state.wsBase || getWsBase()).trim();
  state.wsBase = base;
  if(!base){
    setNet(false, "通信: URLなし");
    say("config.js のURL");
    return;
  }
  const url = wsUrlFromBase(base);

  try{ ws?.close(); }catch{}
  try{
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
  }catch{
    setNet(false, "通信: NG");
    scheduleReconnect();
    return;
  }

  ws.onopen = ()=>{
    reconnectTry = 0;
    setNet(true);
    startKeepalive();
    sendJson({t:"hello"});
    if(state.room) sendJson({t:"resync", roomId: state.room.roomId});
  };

  ws.onclose = ()=>{
    setNet(false);
    clearInterval(keepaliveTimer);
    scheduleReconnect();
  };

  ws.onerror = ()=>{ setNet(false); };

  ws.onmessage = async (ev)=>{
    if(typeof ev.data === "string"){
      let m=null;
      try{ m=JSON.parse(ev.data); }catch{ return; }
      await onMsg(m);
    }else{
      await onBinary(ev.data);
    }
  };
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    if(!ws || ws.readyState!==1) connect();
  }
});

async function onMsg(m){
  if(!m || !m.t) return;

  if(m.t==="error"){
    say(m.message || "エラー");
    log("server_error", m);
    joinInFlight=false;
    return;
  }
  if(m.t==="room_joined"){
    joinInFlight=false;
    applyRoomJoined(m);
    sendJson({t:"resync", roomId:m.roomId});
    return;
  }
  if(m.t==="room_state"){ applyRoomState(m); return; }
  if(m.t==="frame_update_begin"){
    pendingBinary={roomId:m.roomId, frameIndex:m.frameIndex, mime:m.mime||"image/png"};
    return;
  }
  if(m.t==="frame_submit_ok"){
    state.submitted = true;
    say("OK");
    // create/random はロビーへ戻す（流れが簡単）
    if(state.room && (state.room.flow==="create" || state.room.flow==="random")){
      setTimeout(()=>location.href="./index.html", 450);
    }
    return;
  }
}

async function onBinary(buf){
  if(!pendingBinary) return;
  const {roomId, frameIndex, mime}=pendingBinary;
  pendingBinary=null;
  if(!state.room || state.room.roomId!==roomId) return;

  try{
    const blob=new Blob([buf], {type:mime});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.decoding="async";
    img.src=url;
    await img.decode().catch(()=>{});
    const f=state.frames[frameIndex];
    if(f.url) URL.revokeObjectURL(f.url);
    f.url=url; f.img=img; f.filled=true;

    log("frame_update",{frame:frameIndex});
    if(!state.playing && frameIndex===state.currentFrame){
      drawFrameToMain(frameIndex);
    }
    renderOnion();
  }catch(e){
    log("binary_fail", String(e));
  }
}

function applyRoomJoined(m){
  stopPlayback();
  resetFrames();

  state.room={
    roomId:m.roomId,
    visibility:m.visibility,
    theme:m.theme,
    canEdit:m.canEdit, // assigned/any/view
    assignedFrame: (typeof m.assignedFrame==="number") ? m.assignedFrame : null,
    reservationToken: m.reservationToken || null,
    flow: m.flow || "unknown",
    pass: m.pass || null,
  };

  renderRoomHeader();
  loadLocalDraftsForRoom(state.room.roomId);

  const isView = state.room.canEdit==="view";
  const isAny  = state.room.canEdit==="any";

  // 編集可否
  $("sendBtn").disabled = isView;
  $("penBtn").disabled = isView;
  $("eraserBtn").disabled = isView;
  $("undoBtn").disabled = isView;
  $("clearBtn").disabled = isView;

  // コマスライダーは private(any) のときだけ
  $("frameBox").style.display = isAny ? "" : "none";
  slider.disabled = !isAny;
  $("prevBtn").disabled = !isAny;
  $("nextBtn").disabled = !isAny;

  // assigned のときは自分のコマ固定 + 60秒タイマー
  if(state.room.canEdit==="assigned"){
    state.currentFrame = state.room.assignedFrame ?? 0;
    state.autoSubmitAt = Date.now() + CFG.AUTO_SUBMIT_MS;
  }else{
    state.currentFrame = 0;
    state.autoSubmitAt = 0;
  }
  slider.value = String(state.currentFrame);

  touchMyRoom({roomId:state.room.roomId, theme:state.room.theme, visibility:state.room.visibility, pass: state.room.pass});
  drawFrameToMain(state.currentFrame);
  say("入った");
}

function applyRoomState(m){
  if(!state.room || state.room.roomId!==m.roomId) return;
  if(m.theme && state.room.theme!==m.theme){
    state.room.theme=m.theme;
    renderRoomHeader();
  }
  renderKoma();
}

// ===== ログ送信（内部データ。提出じゃない） =====
function sendStrokeLog(){
  if(!state.room) return;
  if(!ws || ws.readyState!==1) return;
  if(!strokePts.length) return;

  // 送る点を間引く
  let pts = strokePts;
  if(pts.length > 500){
    const step = Math.ceil(pts.length / 500);
    pts = pts.filter((_,i)=>i%step===0);
  }
  sendJson({
    t:"log_stroke",
    roomId: state.room.roomId,
    frameIndex: state.currentFrame,
    tool: state.tool,
    color: state.color,
    size: state.size,
    pts,
    ts: Date.now(),
  });
  log("log_stroke",{n:pts.length});
}

// ===== 提出（PNG確定） =====
async function submitCurrentFrame(isAuto){
  if(!state.room) return;
  if(state.room.canEdit==="view") return;
  if(state.room.canEdit==="assigned" && state.currentFrame!==state.room.assignedFrame) return;
  if(state.submitted) return;

  if(!ws || ws.readyState!==1){
    say("通信OFF");
    connect();
    return;
  }

  if(state.dirty) saveLocalDraft();

  const frameIndex=state.currentFrame;
  const roomId=state.room.roomId;

  const blob = await new Promise((resolve)=>cDraw.toBlob(resolve, "image/png"));
  if(!blob){ say("送れない"); return; }

  sendJson({
    t:"submit_begin",
    roomId,
    frameIndex,
    mime:"image/png",
    reservationToken: state.room.reservationToken || undefined,
  });
  ws.send(blob);

  state.dirty=false;
  if(!isAuto) say("送信中…", 900);
  log("submit",{roomId, frameIndex, auto:!!isAuto});
}

// ② 60秒で自動提出（assignedだけ）
setInterval(()=>{
  if(!state.room) return;
  if(state.room.canEdit!=="assigned") return;
  if(state.submitted) return;
  renderKoma();
  if(state.autoSubmitAt && Date.now() >= state.autoSubmitAt){
    submitCurrentFrame(true);
  }
}, 250);

// ===== 入室（ページは完全分離。ここは editor だけ） =====
function beginAction(){
  const action = loadPendingAction();
  clearPendingAction();

  if(!action){
    say("ロビー");
    setTimeout(()=>location.href="./index.html", 600);
    return;
  }

  connect();

  const tryJoin = () => {
    if(!ws || ws.readyState!==1){
      setTimeout(tryJoin, 160);
      return;
    }
    if(joinInFlight) return;
    joinInFlight=true;

    if(action.kind==="create"){
      sendJson({
        t:"create_room",
        visibility: action.visibility==="private" ? "private" : "public",
        theme: action.theme || "お題",
        passphrase: action.visibility==="private" ? (action.passphrase||"") : undefined,
      });
      badge.textContent="部屋を作成中";
      return;
    }
    if(action.kind==="random"){
      sendJson({t:"join_random"});
      badge.textContent="部屋を探し中";
      return;
    }
    if(action.kind==="private"){
      sendJson({t:"join_private", roomId: (action.roomId||"").toUpperCase(), passphrase: action.passphrase||""});
      badge.textContent="入室中";
      return;
    }
    if(action.kind==="view"){
      const msg={t:"join_view", roomId: (action.roomId||"").toUpperCase()};
      if(action.passphrase) msg.passphrase = action.passphrase;
      sendJson(msg);
      badge.textContent="読み込み中";
      return;
    }

    joinInFlight=false;
    say("ロビー");
    setTimeout(()=>location.href="./index.html", 600);
  };
  tryJoin();
}

// ===== 初期化 =====
fillWhite(ctx);
fillWhite(pctx);
octx.clearRect(0,0,W,H);
setTool("pen");
setNet(false);
renderRoomHeader();
beginAction();
