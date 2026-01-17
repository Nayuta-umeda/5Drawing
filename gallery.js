import {
  listWorks,
  updateWorkMeta,
  savePublicSnapshotFrames,
  deleteWorkMeta,
  deletePublicSnapshotFrames,
  deletePrivateWorkFrames,
} from "./util.js";

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const listEl = document.getElementById("list");
const toastMask = document.getElementById("toastMask");
const toastTitle = document.getElementById("toastTitle");
const toastText = document.getElementById("toastText");
const toastOk = document.getElementById("toastOk");

toastOk.onclick = () => toastMask.style.display = "none";

// Phase4: prevent double execution (update spam)
const updatingRooms = new Set();

function fmt(ts){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(title, text){
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastMask.style.display = "flex";
}

function mk(tag, cls, text){
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}


function openViewer(roomId, theme){
  const sp = new URLSearchParams({ roomId, theme: theme || "" });
  sp.set("useLocal", "1");
  location.href = "./viewer.html?" + sp.toString();
}
function makeWorkCard(w){

  const card = mk("div", "card");
  card.style.padding = "12px";
  card.style.marginBottom = "10px";

  const row = mk("div", "workRow");

  const img = document.createElement("img");
  img.className = "thumb";
  img.src = w.thumb || "";
  img.alt = "thumb";
  if (!w.thumb) img.style.background = "linear-gradient(135deg, rgba(110,168,255,.25), rgba(167,216,255,.12))";

  const info = mk("div", "workInfo");
  const title = mk("div", "", w.kind === "public" ? `公開：${w.roomId}` : `プライベート：${w.roomId}`);
  title.style.fontWeight = "1000";
  const sub = mk("div", "small muted", `お題：${w.theme || "-"} / 保存：${fmt(w.at)}`);
  info.appendChild(title);
  info.appendChild(sub);

  row.appendChild(img);
  row.appendChild(info);
  card.appendChild(row);

  const btns = mk("div", "workBtns");

  if (w.kind === "public") {
    const bUpdate = mk("button", "btn", "更新");
    const bView = mk("button", "btn btnAccent", "見る");
    const bDel = mk("button", "btn btnDanger", "削除");
    bUpdate.onclick = () => updatePublic(w);
    bView.onclick = () => {
      const q = new URLSearchParams({ roomId: w.roomId, theme: w.theme || "" });
      q.set("useLocal", "1");
      // If the local snapshot only has *my* frame (pre-update), jump to it by default.
      if (Number.isFinite(Number(w.myFrameIndex))) q.set("start", String(Number(w.myFrameIndex) + 1));
      location.href = "./viewer.html?" + q.toString();
    };
    bDel.onclick = async () => {
      if (!confirm("削除しますか？")) return;
      try{
        // Remove meta first (so UI updates even if IDB fails)
        deleteWorkMeta(w.id);

        // Only delete snapshot frames if no other work references this roomId.
        const remains = listWorks().some(x => x.kind === "public" && x.roomId === w.roomId);
        if (!remains) await deletePublicSnapshotFrames(w.roomId);

        showToast("削除", "削除しました");
      }catch(e){
        showToast("削除", "削除に失敗しました（端末の保存領域の状態を確認してね）");
      }
      render();
    };
    btns.appendChild(bUpdate);
    btns.appendChild(bView);
    btns.appendChild(bDel);
  } else {
    const bEdit = mk("button", "btn btnAccent", "編集");
    const bDel = mk("button", "btn btnDanger", "削除");
    bEdit.onclick = () => {
      const q = new URLSearchParams({ mode:"private_local", workId:w.id, theme:w.theme||"" });
      location.href = "./editor.html?" + q.toString();
    };
    bDel.onclick = async () => {
      if (!confirm("削除しますか？")) return;
      try{
        deleteWorkMeta(w.id);
        await deletePrivateWorkFrames(w.id);
        showToast("削除", "削除しました");
      }catch(e){
        showToast("削除", "削除に失敗しました（端末の保存領域の状態を確認してね）");
      }
      render();
    };
    btns.appendChild(bEdit);
    btns.appendChild(bDel);
  }

  card.appendChild(btns);
  return card;
}

function updatePublic(w){
  if (!w || !w.roomId) return;
  if (updatingRooms.has(w.roomId)) return;
  updatingRooms.add(w.roomId);

  const ws = window.V15.createLoggedWebSocket();
  const MAX_MS = 22000;
  let filled = null;
  const frames = Array.from({length:60}, () => null);

  const pending = new Map(); // frameIndex -> { tries, t }
  const FRAME_RETRY_MAX = 3;

  function clearPending(){
    for (const [,e] of pending){
      if (e && e.t) clearTimeout(e.t);
    }
    pending.clear();
  }

  function countMissing(){
    if (!filled) return 0;
    let miss = 0;
    for (let i=0;i<60;i++){
      if (filled[i] && !frames[i]) miss++;
    }
    return miss;
  }

  function maybeFinish(){
    if (!filled) return;
    if (pending.size !== 0) return;
    const miss = countMissing();
    if (miss === 0) return finalize(true, "「見る」で最新スナップショットを確認できます");
    return finalize(false, `一部取得できませんでした（${miss}コマ欠け）。もう一度「更新」すると直ることが多いです`);
  }

  async function finalize(ok, message){
    clearTimeout(timer);
    updatingRooms.delete(w.roomId);
    clearPending();
    try{ ws.close(); }catch(e){}

    // Save snapshot for "見る" (manual update)
    try{ await savePublicSnapshotFrames(w.roomId, frames); }catch(e){}
    updateWorkMeta(w.id, { lastSyncAt: Date.now(), filled, theme: w.theme });

    showToast(ok ? "更新完了" : "更新（部分）", message);
    render();
  }

  showToast("更新中", "サーバから現在のコマ情報を取得しています…");

  const timer = setTimeout(() => {
    finalize(false, "タイムアウト：一部しか取得できませんでした");
  }, MAX_MS);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
    ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId:w.roomId, view:true } }));
    ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId:w.roomId } }));
  });

  function requestFrame(i, force=false){
    if (typeof i !== "number" || i<0 || i>=60) return;
    if (frames[i]) return;

    const cur = pending.get(i);
    if (cur && !force) return;
    const tries = (cur?.tries ?? 0);
    if (tries >= FRAME_RETRY_MAX){
      if (cur && cur.t) clearTimeout(cur.t);
      pending.delete(i);
      return maybeFinish();
    }
    if (cur && cur.t) clearTimeout(cur.t);

    const next = { tries: tries + 1, t: null };
    pending.set(i, next);

    try{
      ws.send(JSON.stringify({ v:1, t:"get_frame", ts:Date.now(), data:{ roomId:w.roomId, frameIndex:i } }));
    }catch(_e){}

    const backoff = 800 + (next.tries-1)*450 + Math.floor(Math.random()*220);
    next.t = setTimeout(() => {
      const e = pending.get(i);
      if (!e) return;
      if (frames[i]){
        if (e.t) clearTimeout(e.t);
        pending.delete(i);
        return maybeFinish();
      }
      requestFrame(i, true);
    }, backoff);
  }

  ws.addEventListener("message", (ev) => {
    try{
      const m = JSON.parse(ev.data);
      if (m.t === "room_state"){
        const d = m.data || {};
        filled = Array.isArray(d.filled) ? d.filled.slice(0,60) : null;
        if (typeof d.theme === "string" && d.theme) updateWorkMeta(w.id, { theme: d.theme });

        if (filled){
          for (let i=0;i<60;i++) if (filled[i]) requestFrame(i);
          if (filled.every(v => !v)) return finalize(true, "まだ1コマも提出されていません");
        }
        return;
      }

      if (m.t === "frame_data"){
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60 && typeof d.dataUrl === "string"){
          frames[i] = d.dataUrl;
          const pe = pending.get(i);
          if (pe && pe.t) clearTimeout(pe.t);
          pending.delete(i);
          return maybeFinish();
        }
        return;
      }

      if (m.t === "error"){
        return finalize(false, m.data?.message || m.message || "unknown");
      }
    }catch(e){}
  });

  ws.addEventListener("error", () => {
    finalize(false, "通信エラー：接続できませんでした");
  });
  ws.addEventListener("close", () => {
    // If we didn't finish yet, we'll let the timer/finalize handle it.
  });
}


function render(){
  const list = listWorks();
  listEl.innerHTML = "";
  if (!list.length) {
    listEl.appendChild(mk("div", "small muted", "まだ作品がないよ。"));
    return;
  }
  for (const w of list) listEl.appendChild(makeWorkCard(w));
}
render();
