import { loadJson, addMyRoom } from "./util.js";

window.V12.ensureLogUi();
const list = document.getElementById("list");

const ws = window.V12.createLoggedWebSocket();

ws.addEventListener("open", () => ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} })));

function mkRoomCard(r){
  const card = document.createElement("div");
  card.className = "card";
  card.style.padding = "12px";
  card.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>
        <div style="font-weight:900;">${escapeHtml(r.theme || "(no theme)")}</div>
        <div class="small muted">ID: <span class="badge">${escapeHtml(r.roomId)}</span></div>
      </div>
      <div class="small muted">${new Date(r.at || Date.now()).toLocaleString()}</div>
    </div>
    <div style="height:10px;"></div>
    <div class="grid2">
      <button class="btn" data-act="view">現在の状態を閲覧</button>
      <button class="btn btnWarn" data-act="fork">プライベートで編集</button>
    </div>
  `;

  const btnView = card.querySelector('[data-act="view"]');
  const btnFork = card.querySelector('[data-act="fork"]');

  btnView.onclick = () => {
    const q = new URLSearchParams({ roomId: r.roomId, view: "1" });
    location.href = "./viewer.html?" + q.toString();
  };

  btnFork.onclick = () => {
    const pw = prompt("プライベート用の合言葉を入力（後で入室に必要）");
    if (pw === null) return;
    ws.send(JSON.stringify({ v:1, t:"fork_private", ts:Date.now(), data:{ roomId: r.roomId, password: String(pw || "").trim() } }));
  };

  return card;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "forked") {
      addMyRoom({ roomId: m.data.roomId, theme: m.data.theme, at: Date.now() });
      const q = new URLSearchParams({ roomId: m.data.roomId, password: m.data.password || "" });
      location.href = "./editor.html?" + q.toString();
    }
  }catch(e){}
});

function render(){
  list.innerHTML = "";
  const rooms = loadJson("anim5s_my_rooms_v12", []);
  if (!rooms.length) {
    const p = document.createElement("div");
    p.className = "small muted";
    p.textContent = "まだ作品がないよ。ロビーから作ってみよう。";
    list.appendChild(p);
    return;
  }
  for (const r of rooms) list.appendChild(mkRoomCard(r));
}
render();
