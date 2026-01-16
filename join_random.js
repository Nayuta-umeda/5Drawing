window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const toastMask = document.getElementById("toastMask");
const toastTitle = document.getElementById("toastTitle");
const toastText = document.getElementById("toastText");

function showError(title, text){
  toastTitle.textContent = title;
  toastText.textContent = text;
  toastMask.style.display = "flex";
}

startBtn.onclick = () => {
  startBtn.disabled = true;
  statusEl.textContent = "接続中…";
  const ws = window.V15.createLoggedWebSocket();

  const timeout = setTimeout(() => {
    showError("接続タイムアウト", "サーバに繋がりませんでした（Render停止/デプロイ失敗の可能性）。");
    try{ ws.close(); }catch(e){}
  }, 9000);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
    ws.send(JSON.stringify({ v:1, t:"join_random", ts:Date.now(), data:{} }));
  });

  ws.addEventListener("message", (ev) => {
    try{
      const m = JSON.parse(ev.data);
      if (m.t === "room_joined") {
        clearTimeout(timeout);
        const d = m.data || {};
        statusEl.textContent = "入室OK。編集へ移動…";
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

  ws.addEventListener("close", () => startBtn.disabled = false);
};
