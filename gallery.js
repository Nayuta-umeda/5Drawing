import { listWorks, updateWorkMeta } from "./util.js";

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
  showToast("更新中…", "サーバに接続しています");
  const ws = window.V15.createLoggedWebSocket();

  const timeout = setTimeout(() => {
    try{ ws.close(); }catch(e){}
    showToast("更新失敗", "タイムアウト：サーバに繋がりませんでした");
  }, 9000);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
    ws.send(JSON.stringify({ v:1, t:"join_room", ts:Date.now(), data:{ roomId:w.roomId, view:true } }));
    ws.send(JSON.stringify({ v:1, t:"resync", ts:Date.now(), data:{ roomId:w.roomId } }));
  });

  ws.addEventListener("message", (ev) => {
    try{
      const m = JSON.parse(ev.data);
      if (m.t === "room_state") {
        clearTimeout(timeout);
        const d = m.data || {};
        updateWorkMeta(w.id, { lastSyncAt: Date.now(), filled: d.filled || null, theme: d.theme || w.theme });
        try{ ws.close(); }catch(e){}
        showToast("更新完了", "「見る」で現在の状態を確認できます");
      }
      if (m.t === "error") {
        clearTimeout(timeout);
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
