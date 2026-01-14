import { loadJson, saveJson } from "./util.js";

window.V12.ensureLogUi();
const listEl = document.getElementById("list");

function fmt(ts){
  try{
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch(e){ return ""; }
}

function mk(tag, cls, text){
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function btn(text, accent=false){
  const b = mk("button", "btn" + (accent ? " btnAccent" : ""), text);
  b.style.flex = "1";
  b.style.minWidth = "140px";
  return b;
}

function render(){
  listEl.innerHTML = "";

  const works = loadJson("anim5s_my_works_v13", []);
  const legacyRooms = loadJson("anim5s_my_rooms_v12", []);

  if (!works.length && !legacyRooms.length) {
    const p = mk("div", "small muted", "まだ作品がないよ。ロビーから作ってみよう。");
    listEl.appendChild(p);
    return;
  }

  // works (snapshot-aware)
  for (const w of works) {
    const card = mk("div", "card");
    card.style.padding = "12px";

    const top = mk("div", "row");
    top.style.justifyContent = "space-between";
    top.style.alignItems = "flex-start";

    const left = mk("div", "col");
    const title = mk("div", "");
    title.style.fontWeight = "900";
    title.textContent = `${w.roomId}`;
    const sub = mk("div", "small muted", `お題：${w.theme || "-"} / 保存：${fmt(w.at)} / 保存コマ数：${w.snapshotCount ?? 0}`);
    left.appendChild(title);
    left.appendChild(sub);

    const badge = mk("div", "badge", "保存あり");
    top.appendChild(left);
    top.appendChild(badge);

    const row = mk("div", "row");
    row.style.gap = "8px";
    row.style.marginTop = "10px";
    row.style.flexWrap = "wrap";

    const snapBtn = btn("保存時の状態を見る", true);
    snapBtn.onclick = () => {
      const q = new URLSearchParams({ workId: w.id });
      location.href = "./viewer.html?" + q.toString();
    };

    const liveBtn = btn("今の状態を見る");
    liveBtn.onclick = () => {
      const q = new URLSearchParams({ roomId: w.roomId });
      location.href = "./viewer.html?" + q.toString();
    };

    const forkBtn = btn("プライベートで編集");
    forkBtn.onclick = async () => {
      const pass = prompt("合言葉を入力（プライベート用）", "");
      if (pass == null) return;

      // fork_private: 新ID自動割当 + 合言葉
      const ws = window.V12.createLoggedWebSocket();
      const done = (href) => { try{ ws.close(); }catch(e){} location.href = href; };

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
        ws.send(JSON.stringify({ v:1, t:"fork_private", ts:Date.now(), data:{ roomId: w.roomId, password: pass } }));
      });

      ws.addEventListener("message", (ev) => {
        try{
          const m = JSON.parse(ev.data);
          if (m.t === "forked") {
            const d = m.data || {};
            const q = new URLSearchParams({ roomId: d.roomId, password: d.password || pass, mode: "private" });
            done("./editor.html?" + q.toString());
            return;
          }
          if (m.t === "error") alert("エラー: " + (m.data?.message || m.message || "unknown"));
        }catch(e){}
      });
    };

    row.appendChild(snapBtn);
    row.appendChild(liveBtn);
    row.appendChild(forkBtn);

    card.appendChild(top);
    card.appendChild(row);
    listEl.appendChild(card);
  }

  // legacy rooms (no snapshot)
  for (const r of legacyRooms) {
    if (works.some(w => w.roomId === r.roomId)) continue;
    const card = mk("div", "card");
    card.style.padding = "12px";

    const title = mk("div", "");
    title.style.fontWeight = "900";
    title.textContent = r.roomId;

    const sub = mk("div", "small muted", `お題：${r.theme || "-"} / 記録：${fmt(r.at || Date.now())}`);
    card.appendChild(title);
    card.appendChild(sub);

    const row = mk("div", "row");
    row.style.gap = "8px";
    row.style.marginTop = "10px";
    row.style.flexWrap = "wrap";

    const liveBtn = btn("今の状態を見る", true);
    liveBtn.onclick = () => {
      const q = new URLSearchParams({ roomId: r.roomId });
      location.href = "./viewer.html?" + q.toString();
    };

    const forkBtn = btn("プライベートで編集");
    forkBtn.onclick = async () => {
      const pass = prompt("合言葉を入力（プライベート用）", "");
      if (pass == null) return;

      const ws = window.V12.createLoggedWebSocket();
      const done = (href) => { try{ ws.close(); }catch(e){} location.href = href; };

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ v:1, t:"hello", ts:Date.now(), data:{} }));
        ws.send(JSON.stringify({ v:1, t:"fork_private", ts:Date.now(), data:{ roomId: r.roomId, password: pass } }));
      });

      ws.addEventListener("message", (ev) => {
        try{
          const m = JSON.parse(ev.data);
          if (m.t === "forked") {
            const d = m.data || {};
            const q = new URLSearchParams({ roomId: d.roomId, password: d.password || pass, mode: "private" });
            done("./editor.html?" + q.toString());
            return;
          }
          if (m.t === "error") alert("エラー: " + (m.data?.message || m.message || "unknown"));
        }catch(e){}
      });
    };

    row.appendChild(liveBtn);
    row.appendChild(forkBtn);
    card.appendChild(row);

    listEl.appendChild(card);
  }
}

render();
