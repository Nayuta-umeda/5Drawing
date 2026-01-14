import { addMyRoom } from "./util.js";

window.V12.ensureLogUi();
const ws = window.V12.createLoggedWebSocket();
const msg = document.getElementById("msg");
function setMsg(t){ msg.textContent = t; }

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  setMsg("接続OK。ボタンで参加。");
});

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "joined") {
      addMyRoom({ roomId: m.data.roomId, theme: m.data.theme, at: Date.now() });
      const q = new URLSearchParams({ roomId: m.data.roomId, password: m.data.password || "" });
      location.href = "./editor.html?" + q.toString();
    }
    if (m.t === "error") setMsg("エラー: " + (m.data?.message || "unknown"));
  }catch(e){}
});

document.getElementById("go").onclick = () => {
  setMsg("探し中…");
  ws.send(JSON.stringify({ v:1, t:"join_random", ts:Date.now(), data:{} }));
};
