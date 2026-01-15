import { addPrivateWork } from "./util.js";



function randomTheme(){
  const THEMES = [
    "走る犬","くるま","宇宙人","おにぎり","雨の日","ジャンプ","落下","変身","ねこパンチ",
    "通勤時間","料理","かくれんぼ","風船","雪だるま","電車","魔法","釣り","ダンス"
  ];
  return THEMES[Math.floor(Math.random()*THEMES.length)];
}
function draftId7(){
  return Math.random().toString(36).slice(2,9).toUpperCase();
}

window.V15.ensureLogUi();
window.V15.addLog("page_load", { path: location.pathname });

const themeEl = document.getElementById("theme");
const go = document.getElementById("go");

function getKind(){
  return [...document.querySelectorAll('input[name="kind"]')].find(x => x.checked)?.value || "public";
}

go.onclick = () => {
  const rawTheme = (themeEl.value || "").trim();
  const theme = rawTheme ? rawTheme : randomTheme();
  const kind = getKind();

  if (kind === "public") {
    const q = new URLSearchParams({ mode:"create_public", theme, assigned:"0", draftId: draftId7() });
    location.href = "./editor.html?" + q.toString();
    return;
  }

  const id = addPrivateWork({ theme });
  const q = new URLSearchParams({ mode:"private_local", workId:id, theme });
  location.href = "./editor.html?" + q.toString();
};
