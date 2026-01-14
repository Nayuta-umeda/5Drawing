import { addMyRoom } from "./util.js";

window.V12.ensureLogUi();
const ws = window.V12.createLoggedWebSocket();
const msg = document.getElementById("msg");
function setMsg(t){ msg.textContent = t; }

function goEditor(payload){
  const roomId = payload.roomId;
  const pass = payload.pass ?? payload.password ?? "";
  const token = payload.reservationToken ?? payload.token ?? "";
  const assignedFrame = (typeof payload.assignedFrame === "number") ? payload.assignedFrame : "";
  addMyRoom({ roomId, theme: payload.theme || "", at: Date.now() });

  const q = new URLSearchParams({
    roomId,
    password: String(pass || ""),
    token: String(token || ""),
    assigned: String(assignedFrame)
  });
  location.href = "./editor.html?" + q.toString();
}

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  setMsg("接続OK。ボタンで参加。");
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "room_joined") { goEditor(m); return; }
    if (m.t === "joined") {
      const d = m.data || {};
      goEditor({ roomId: d.roomId, theme: d.theme, password: d.password, assignedFrame: d.assignedFrame });
      return;
    }
    if (m.t === "error") setMsg("エラー: " + (m.data?.message || m.message || "unknown"));
  }catch(e){}
});

document.getElementById("go").onclick = () => {
  setMsg("探し中…");
  ws.send(JSON.stringify({ v:1, t:"join_random", ts:Date.now(), data:{} }));
};
