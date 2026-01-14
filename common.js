// client/common.js (V15: ws helper + debug log)
(function(){
  const LOG_KEY = "anim5s_debug_log_v15";
  const MAX = 1200;

  function ts(){ return Date.now(); }
  function safeJson(v){ try{ return JSON.stringify(v); }catch(e){ return String(v); } }

  function pushLog(type, data){
    const item = { t: ts(), type, data };
    let list = [];
    try{ list = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }catch(e){}
    list.push(item);
    if (list.length > MAX) list = list.slice(list.length - MAX);
    try{ localStorage.setItem(LOG_KEY, JSON.stringify(list)); }catch(e){}
    return item;
  }

  function clearLog(){
    try{ localStorage.setItem(LOG_KEY, "[]"); }catch(e){}
    pushLog("log_cleared", null);
  }

  function readLog(){
    try{ return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }catch(e){ return []; }
  }

  function wsUrlFromBase(base){
    if (!base) return "";
    let b = String(base).trim();
    if (!b) return "";
    if (b.startsWith("ws://") || b.startsWith("wss://")) return b.endsWith("/ws") ? b : (b.replace(/\/+$/,"") + "/ws");
    if (!/^https?:\/\//.test(b)) b = "https://" + b;
    const url = new URL(b);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    const host = url.host;
    const path = (url.pathname && url.pathname !== "/") ? url.pathname.replace(/\/+$/,"") : "";
    const wsPath = (path.endsWith("/ws")) ? path : (path + "/ws");
    return proto + "//" + host + wsPath;
  }

  function getWsBase(){
    return (window.ANIM5S_CONFIG?.DEFAULT_SERVER_BASE || "").trim();
  }

  function createLoggedWebSocket(){
    const base = getWsBase();
    const wsUrl = wsUrlFromBase(base);
    pushLog("ws_ctor", { base, wsUrl });

    const ws = new WebSocket(wsUrl);

    const origSend = ws.send.bind(ws);
    ws.send = (data) => {
      const text = (typeof data === "string") ? data : safeJson(data);
      pushLog("ws_send", { text: text.slice(0, 1000) });
      return origSend(data);
    };

    ws.addEventListener("open", () => pushLog("ws_open", null));
    ws.addEventListener("close", (e) => pushLog("ws_close", { code:e.code, reason:e.reason }));
    ws.addEventListener("error", () => pushLog("ws_error", null));
    ws.addEventListener("message", (ev) => {
      const text = String(ev.data || "");
      pushLog("ws_recv", { text: text.slice(0, 1200) });
    });

    return ws;
  }

  function ensureLogUi(){
    if (document.getElementById("logBtn")) return;

    const btn = document.createElement("button");
    btn.id = "logBtn";
    btn.textContent = "LOG";
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "logPanel";
    panel.innerHTML = `
      <header>
        <div class="title">Debug Log</div>
        <a class="badge" href="javascript:void(0)" id="logClose">閉じる</a>
      </header>
      <div class="body" id="logBody"></div>
      <div class="tools">
        <button id="logCopy">コピー</button>
        <button id="logClear">消去</button>
      </div>
    `;
    document.body.appendChild(panel);

    const body = panel.querySelector("#logBody");
    const close = panel.querySelector("#logClose");
    const copy = panel.querySelector("#logCopy");
    const clear = panel.querySelector("#logClear");

    function render(){
      const list = readLog();
      const lines = list.map(x => `${new Date(x.t).toISOString()}  ${x.type}  ${x.data==null? "null" : safeJson(x.data)}`);
      body.textContent = lines.join("\n");
      body.scrollTop = body.scrollHeight;
    }

    btn.onclick = () => {
      panel.style.display = (panel.style.display === "block") ? "none" : "block";
      if (panel.style.display === "block") render();
    };
    close.onclick = () => (panel.style.display = "none");
    copy.onclick = async () => {
      try{
        await navigator.clipboard.writeText(body.textContent || "");
        alert("コピーしたよ");
      }catch(e){
        alert("コピー失敗（ブラウザ制限）");
      }
    };
    clear.onclick = () => { clearLog(); render(); };
  }

  window.V15 = { addLog: pushLog, clearLog, readLog, ensureLogUi, createLoggedWebSocket, wsUrlFromBase };

  window.addEventListener("unhandledrejection", (ev) => pushLog("unhandledrejection", { reason: String(ev.reason || "") }));
  window.addEventListener("error", (ev) => pushLog("error", { message: ev.message, filename: ev.filename, lineno: ev.lineno }));
})();
