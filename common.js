// client/common.js (V15: ws helper + debug log)
(function(){
  const LOG_KEY = "anim5s_debug_log_v15";
  const MAX = 1200;

  // App-side confirm modal (avoid browser-native confirm())
  function ensureConfirmUi(){
    if (document.getElementById("confirmMask")) return;

    const mask = document.createElement("div");
    mask.className = "modalMask";
    mask.id = "confirmMask";
    mask.style.display = "none";
    mask.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmText">
        <h2 id="confirmTitle">確認</h2>
        <p id="confirmText">続行しますか？</p>
        <div class="modalBtns">
          <button class="btn btnGhost" id="confirmCancel" type="button">キャンセル</button>
          <button class="btn btnDanger" id="confirmOk" type="button">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
  }

  // Returns Promise<boolean>
  function confirmModal(opts){
    ensureConfirmUi();
    const mask = document.getElementById("confirmMask");
    const titleEl = document.getElementById("confirmTitle");
    const textEl  = document.getElementById("confirmText");
    const okBtn   = document.getElementById("confirmOk");
    const cancelBtn = document.getElementById("confirmCancel");

    const title = (opts?.title ?? "確認");
    const text = (opts?.text ?? "続行しますか？");
    const okText = (opts?.okText ?? "OK");
    const cancelText = (opts?.cancelText ?? "キャンセル");
    const danger = !!opts?.danger;

    titleEl.textContent = title;
    textEl.textContent = text;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    okBtn.className = danger ? "btn btnDanger" : "btn btnAccent";

    // Prevent double-open
    if (mask.__busy) return Promise.resolve(false);
    mask.__busy = true;

    mask.style.display = "flex";

    // focus: default to cancel (safer)
    try{ cancelBtn.focus(); }catch(_e){}

    return new Promise((resolve) => {
      let settled = false;

      function cleanup(val){
        if (settled) return;
        settled = true;
        mask.style.display = "none";
        mask.__busy = false;
        mask.removeEventListener("click", onMask);
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        window.removeEventListener("keydown", onKey);
        resolve(val);
      }

      function onOk(){ cleanup(true); }
      function onCancel(){ cleanup(false); }
      function onMask(ev){
        // Click outside modal -> cancel
        if (ev.target === mask) cleanup(false);
      }
      function onKey(ev){
        if (ev.key === "Escape") cleanup(false);
      }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      mask.addEventListener("click", onMask);
      window.addEventListener("keydown", onKey);
    });
  }

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

  window.V15 = {
    addLog: pushLog,
    clearLog,
    readLog,
    ensureLogUi,
    ensureConfirmUi,
    confirmModal,
    createLoggedWebSocket,
    wsUrlFromBase,
  };

  window.addEventListener("unhandledrejection", (ev) => pushLog("unhandledrejection", { reason: String(ev.reason || "") }));
  window.addEventListener("error", (ev) => pushLog("error", { message: ev.message, filename: ev.filename, lineno: ev.lineno }));
})();
