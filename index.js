import { } from "./util.js";

const badge = document.getElementById("netBadge");

function setBadge(text, ok=false){
  badge.textContent = text;
  badge.style.borderColor = ok ? "rgba(59,214,113,.35)" : "rgba(255,255,255,.12)";
  badge.style.background = ok ? "rgba(59,214,113,.15)" : "rgba(255,255,255,.06)";
}

window.V12.ensureLogUi();

const ws = window.V12.createLoggedWebSocket();

ws.addEventListener("open", () => {
  setBadge("WS: OPEN", true);
  ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
});
ws.addEventListener("close", () => setBadge("WS: CLOSE"));
ws.addEventListener("error", () => setBadge("WS: ERROR"));

document.getElementById("btnCreate").onclick = () => location.href = "./create.html";
document.getElementById("btnJoinRandom").onclick = () => location.href = "./join_random.html";
document.getElementById("btnJoinPrivate").onclick = () => location.href = "./join_private.html";
document.getElementById("btnGallery").onclick = () => location.href = "./gallery.html";
