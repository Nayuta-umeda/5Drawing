window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const startBtn = document.getElementById("start");
const joinByIdBtn = document.getElementById("joinById");
const roomIdInput = document.getElementById("roomIdInput");
const statusEl = document.getElementById("status");

const ROOM_ID_RE = /^[A-Z0-9]{6,12}$/;
const toastMask = document.getElementById("toastMask");
const toastTitle = document.getElementById("toastTitle");
const toastText = document.getElementById("toastText");

function showError(title, text){
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastMask.style.display = "flex";
}

function setBusy(b){
  startBtn.disabled = b;
  if (joinByIdBtn) joinByIdBtn.disabled = b;
  if (roomIdInput) roomIdInput.disabled = b;
}

function doJoin(type, data){
  setBusy(true);
  statusEl.textContent = "接続中…";

  const ws = window.V15.createLoggedWebSocket();

  const timeout = setTimeout(() => {
    showError("接続タイムアウト", "サーバに繋がりませんでした（Render停止/デプロイ失敗の可能性）。");
    try{ ws.close(); }catch(e){}
  }, 9000);

  ws.addEventListener("open", () => {
    statusEl.textContent = "参加中…";
    ws.send(JSON.stringify({ v:1, t:type, ts: Date.now(), data: data || {} }));
  });

  ws.addEventListener("message", (ev) => {
    try{
      const m = JSON.parse(String(ev.data || "{}"));
      if (m.t === "room_joined") {
        clearTimeout(timeout);
        const d = m.data || {};
        const q = new URLSearchParams({
          mode:"join_public",
          roomId: d.roomId,
          theme: d.theme || "お題",
          assigned: String(d.assignedFrame ?? -1),
          reservationToken: d.reservationToken || "",
          reservationExpiresAt: String(d.reservationExpiresAt || 0)
        });
        try{ ws.close(); }catch(e){}
        location.href = "./editor.html?" + q.toString();
      }
      if (m.t === "error") {
        clearTimeout(timeout);
        showError("エラー", m.data?.message || m.message || "unknown");
        try{ ws.close(); }catch(e){}
      }
    }catch(e){}
  });

  ws.addEventListener("close", () => {
    setBusy(false);
    statusEl.textContent = "未接続";
  });
}

startBtn.onclick = () => doJoin("join_random", {});

if (joinByIdBtn){
  joinByIdBtn.onclick = () => {
    const roomId = String(roomIdInput?.value || "").trim().toUpperCase();
    if (!roomId){
      showError("IDが必要", "参加したい部屋のIDを入力してね。");
      return;
    }
    if (!ROOM_ID_RE.test(roomId)){
      showError("IDが不正", "IDは英数字（大文字）だけで、長さは6〜12文字だよ。");
      return;
    }
    doJoin("join_by_id", { roomId });
  };
}
