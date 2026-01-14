import { addMyRoom } from "./util.js";

window.V12.ensureLogUi();
const ws = window.V12.createLoggedWebSocket();
const msg = document.getElementById("msg");
const themeEl = document.getElementById("theme");

function setMsg(t){ msg.textContent = t; }

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
  setMsg("接続OK。お題を入れて作成してね。");
});
ws.addEventListener("close", () => setMsg("接続が閉じた…（LOGで原因確認）"));
ws.addEventListener("error", () => setMsg("接続エラー…（LOGで原因確認）"));

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    if (m.t === "created") {
      addMyRoom({ roomId: m.data.roomId, theme: m.data.theme, at: Date.now() });
      const q = new URLSearchParams({ roomId: m.data.roomId, password: m.data.password || "" });
      location.href = "./editor.html?" + q.toString();
    }
    if (m.t === "error") setMsg("エラー: " + (m.data?.message || "unknown"));
  }catch(e){}
});

document.getElementById("go").onclick = () => {
  const theme = themeEl.value.trim();
  setMsg("作成中…");
  ws.send(JSON.stringify({ v:1, t:"create_room", ts:Date.now(), data:{ theme } }));
};
