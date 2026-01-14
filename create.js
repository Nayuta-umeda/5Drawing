import { addPrivateWork } from "./util.js";

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const themeEl = document.getElementById("theme");
const go = document.getElementById("go");

function getKind(){
  return [...document.querySelectorAll('input[name="kind"]')].find(x => x.checked)?.value || "public";
}

go.onclick = () => {
  const theme = (themeEl.value || "").trim() || "お題";
  const kind = getKind();

  if (kind === "public") {
    const q = new URLSearchParams({ mode:"create_public", theme, assigned:"0" });
    location.href = "./editor.html?" + q.toString();
    return;
  }

  const id = addPrivateWork({ theme });
  const q = new URLSearchParams({ mode:"private_local", workId:id, theme });
  location.href = "./editor.html?" + q.toString();
};
