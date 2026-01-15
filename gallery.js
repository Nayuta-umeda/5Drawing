import { listWorks, updateWorkMeta, savePublicSnapshotFrames } from "./util.js";

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const listEl = document.getElementById("list");
const toastMask = document.getElementById("toastMask");
const toastTitle = document.getElementById("toastTitle");
const toastText = document.getElementById("toastText");
const toastOk = document.getElementById("toastOk");

toastOk.onclick = () => toastMask.style.display = "none";

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
    bUpdate.onclick = () => updatePublic(w);
    bView.onclick = () => {
      const q = new URLSearchParams({ roomId: w.roomId, theme: w.theme || "" });
      q.set("useLocal", "1");
      // If the local snapshot only has *my* frame (pre-update), jump to it by default.
      if (Number.isFinite(Number(w.myFrameIndex))) q.set("start", String(Number(w.myFrameIndex) + 1));
      location.href = "./viewer.html?" + q.toString();
    };
    btns.appendChild(bUpdate);
    btns.appendChild(bView);
  } else {
    const bEdit = mk("button", "btn btnAccent", "編集");
    bEdit.onclick = () => {
      const q = new URLSearchParams({ mode:"private_local", workId:w.id, theme:w.theme||"" });
      location.href = "./editor.html?" + q.toString();
    };
    btns.appendChild(bEdit);
  }

  card.appendChild(btns);
  return card;
}

function updatePublic(w){
  const ws = window.V15.createLoggedWebSocket();
  const MAX_MS = 22000;
  let filled = null;
  const frames = Array.from({length:60}, () => null);
  const pending = new Set();

  showToast("更新中", "サーバから現在のコマ情報を取得しています…");
  const t0 = Date.now();
  const timer = setTimeout(() => {
    try{ ws.close(); }catch(e){}
    showToast("更新失敗", "タイムアウト：通信が完了しませんでした");
  }, MAX_MS);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
    ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId:w.roomId, view:true } }));
    ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId:w.roomId } }));
  });

  function requestFrame(i){
    if (pending.has(i)) return;
    pending.add(i);
    ws.send(JSON.stringify({ v:1, t:"get_frame", ts:Date.now(), data:{ roomId:w.roomId, frameIndex:i } }));
  }

  async function finalizeOk(){
    clearTimeout(timer);
    try{ ws.close(); }catch(e){}
    // Save snapshot for "見る" (manual update)
    await savePublicSnapshotFrames(w.roomId, frames);
    updateWorkMeta(w.id, { lastSyncAt: Date.now(), filled, theme: w.theme });
    showToast("更新完了", "「見る」でローカルに保存された最新スナップショットを確認できます");
  }

  ws.addEventListener("message", async (ev) => {
    try{
      const m = JSON.parse(ev.data);
      if (m.t === "room_state"){
        const d = m.data || {};
        filled = Array.isArray(d.filled) ? d.filled.slice(0,60) : null;
        if (typeof d.theme === "string" && d.theme) updateWorkMeta(w.id, { theme: d.theme });
        // Request only filled frames
        if (filled){
          for (let i=0;i<60;i++) if (filled[i]) requestFrame(i);
          // If no frames filled, still finish quickly
          if (filled.every(v => !v)) return await finalizeOk();
        }
        return;
      }
      if (m.t === "frame_data"){
        const d = m.data || {};
        const i = d.frameIndex;
        if (typeof i === "number" && i>=0 && i<60 && typeof d.dataUrl === "string"){
          frames[i] = d.dataUrl;
          pending.delete(i);
          // When all requested are received, finish
          if (filled && pending.size === 0){
            return await finalizeOk();
          }
          // Soft timeout extension
          if (Date.now() - t0 > MAX_MS - 2000 && pending.size > 0){
            // Let timer hit; no action
          }
        }
        return;
      }
      if (m.t === "error"){
        clearTimeout(timer);
        try{ ws.close(); }catch(e){}
        showToast("更新失敗", m.data?.message || m.message || "unknown");
      }
    }catch(e){}
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
