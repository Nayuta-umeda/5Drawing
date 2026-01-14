import { addMyRoom } from "./util.js";

window.V12.ensureLogUi();
const ws = window.V12.createLoggedWebSocket();
const msg = document.getElementById("msg");
const themeEl = document.getElementById("theme");

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
  setMsg("接続OK。お題を入れて作成してね。");
});
ws.addEventListener("close", () => setMsg("接続が閉じた…（LOGで原因確認）"));
ws.addEventListener("error", () => setMsg("接続エラー…（LOGで原因確認）"));

ws.addEventListener("message", (ev) => {
  try{
    const m = JSON.parse(ev.data);
    // 互換: 旧/別サーバは room_joined を返す
    if (m.t === "room_joined") {
      goEditor(m);
      return;
    }
    // 自前サーバは created を返す
    if (m.t === "created") {
      goEditor(m.data || {});
      return;
    }
    if (m.t === "error") setMsg("エラー: " + (m.data?.message || m.message || "unknown"));
  }catch(e){}
});

document.getElementById("go").onclick = () => {
  const theme = themeEl.value.trim();
  setMsg("作成中…");

  // サーバ差分吸収: theme 以外にも複数キーで送る
  ws.send(JSON.stringify({
    v:1, t:"create_room", ts:Date.now(),
    data:{ theme, topic: theme, prompt: theme }
  }));
};
