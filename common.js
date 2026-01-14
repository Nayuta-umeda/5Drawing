/* V12 common.js
  - wsUrlFromBase 強化（/ws 二重付加防止、ws/wss/プロトコル無しも許容）
  - デバッグログ保存（localStorage: anim5s_debug_log_v12, max 1200）
  - LOG UI（右下ボタン）
  - WebSocket ラップして ws_ctor/open/send/recv/close/error を自動記録
*/
(() => {
  "use strict";

  const LOG_KEY = "anim5s_debug_log_v12";
  const MAX_LOG = 1200;

  function isoNow() { return new Date().toISOString(); }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch(e) { return String(x); }
  }

  function loadLogs() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveLogs(arr) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function addLog(type, data = null) {
    const logs = loadLogs();
    const entry = { ts: isoNow(), type, data };
    logs.push(entry);
    if (logs.length > MAX_LOG) logs.splice(0, logs.length - MAX_LOG);
    saveLogs(logs);
    // also mirror to console for quick dev
    try { console.debug("[V12]", type, data); } catch(e) {}
    return entry;
  }

  function clearLogs() {
    try { localStorage.removeItem(LOG_KEY); } catch (e) {}
  }

  function getLogs() { return loadLogs(); }

  // --- pending store helpers (for debugging "保存/読み込み/消去" 的な失敗点の追跡) ---
  function pendingSave(key, value) {
    addLog("pending_save", { key, bytes: (typeof value === "string" ? value.length : safeJson(value).length) });
    localStorage.setItem(key, typeof value === "string" ? value : safeJson(value));
  }
  function pendingLoad(key) {
    addLog("pending_load", { key });
    return localStorage.getItem(key);
  }
  function pendingClear(key) {
    addLog("pending_clear", { key });
    localStorage.removeItem(key);
  }

  // --- robust ws url builder ---
  function normalizeBase(base) {
    let b = String(base || "").trim();
    if (!b) return "";
    // allow protocol-less: example.com or example.com/path
    if (!/^https?:\/\//i.test(b) && !/^wss?:\/\//i.test(b)) {
      b = "https://" + b;
    }
    return b.replace(/\s+/g, "");
  }

  function wsUrlFromBase(base) {
    const b0 = normalizeBase(base);
    if (!b0) return "";
    // If already ws/wss
    let url = b0;
    if (/^https?:\/\//i.test(url)) {
      url = url.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
    }
    // ensure single /ws at end (but preserve path if already includes /ws)
    // strip query/hash
    const u = new URL(url);
    let path = u.pathname || "/";
    // remove trailing slashes
    path = path.replace(/\/+$/g, "");
    if (!path.endsWith("/ws")) {
      path = path + "/ws";
    }
    u.pathname = path;
    u.search = "";
    u.hash = "";
    return u.toString();
  }

  function getWsBase() {
    // v10+ 方針：config.js（window.DEFAULT_SERVER_BASE）を最優先
    const cfg = (typeof window !== "undefined") ? window.DEFAULT_SERVER_BASE : "";
    if (cfg && String(cfg).trim()) return String(cfg).trim();
    // fallback: localStorage (旧版互換)
    try {
      const ls = localStorage.getItem("anim5s_server_base");
      if (ls && String(ls).trim()) return String(ls).trim();
    } catch(e) {}
    // final fallback: current origin
    return (typeof location !== "undefined") ? location.origin : "";
  }

  function trimLong(s, max = 900) {
    if (typeof s !== "string") s = safeJson(s);
    if (s.length <= max) return s;
    return s.slice(0, max) + ` …(${s.length - max} chars trimmed)`;
  }

  function createLoggedWebSocket(baseOrWsUrl) {
    const base = baseOrWsUrl || getWsBase();
    const wsUrl = wsUrlFromBase(base);
    addLog("ws_ctor", { base, wsUrl });

    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => addLog("ws_open"));
    ws.addEventListener("close", (ev) => addLog("ws_close", { code: ev.code, reason: ev.reason, wasClean: ev.wasClean }));
    ws.addEventListener("error", () => addLog("ws_error"));
    ws.addEventListener("message", (ev) => {
      const text = typeof ev.data === "string" ? ev.data : "[binary]";
      addLog("ws_recv", { text: trimLong(text) });
    });

    const _send = ws.send.bind(ws);
    ws.send = (data) => {
      const text = typeof data === "string" ? data : "[binary]";
      addLog("ws_send", { text: trimLong(text) });
      return _send(data);
    };

    return ws;
  }

  // --- LOG UI ---
  function ensureLogUi() {
    if (document.getElementById("v12LogBtn")) return;

    const btn = document.createElement("button");
    btn.id = "v12LogBtn";
    btn.textContent = "LOG";
    btn.style.position = "fixed";
    btn.style.right = "12px";
    btn.style.bottom = "12px";
    btn.style.zIndex = "9999";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "14px";
    btn.style.border = "1px solid rgba(255,255,255,.15)";
    btn.style.background = "rgba(20,23,34,.92)";
    btn.style.color = "#e6e6eb";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "700";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    btn.style.backdropFilter = "blur(8px)";

    const overlay = document.createElement("div");
    overlay.id = "v12LogOverlay";
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.zIndex = "9998";
    overlay.style.background = "rgba(0,0,0,.55)";
    overlay.style.display = "none";
    overlay.style.padding = "14px";

    const panel = document.createElement("div");
    panel.style.maxWidth = "980px";
    panel.style.margin = "0 auto";
    panel.style.height = "calc(100vh - 28px)";
    panel.style.borderRadius = "18px";
    panel.style.background = "#141722";
    panel.style.border = "1px solid rgba(255,255,255,.08)";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,.45)";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.gap = "10px";
    top.style.alignItems = "center";
    top.style.padding = "12px";
    top.style.borderBottom = "1px solid rgba(255,255,255,.08)";

    const title = document.createElement("div");
    title.textContent = "V12 Debug Log";
    title.style.fontWeight = "800";
    title.style.letterSpacing = ".06em";
    title.style.opacity = ".9";

    const spacer = document.createElement("div");
    spacer.style.flex = "1";

    const filter = document.createElement("input");
    filter.type = "text";
    filter.placeholder = "絞り込み（type / キーワード）";
    filter.style.flex = "1";
    filter.style.minWidth = "160px";
    filter.style.padding = "10px 12px";
    filter.style.borderRadius = "12px";
    filter.style.border = "1px solid rgba(255,255,255,.12)";
    filter.style.background = "#0f1220";
    filter.style.color = "#e6e6eb";

    const btnCopy = document.createElement("button");
    btnCopy.textContent = "コピー";
    styleMini(btnCopy);

    const btnClear = document.createElement("button");
    btnClear.textContent = "消去";
    styleMini(btnClear);

    const btnClose = document.createElement("button");
    btnClose.textContent = "閉じる";
    styleMini(btnClose);

    top.appendChild(title);
    top.appendChild(spacer);
    top.appendChild(filter);
    top.appendChild(btnCopy);
    top.appendChild(btnClear);
    top.appendChild(btnClose);

    const body = document.createElement("div");
    body.style.flex = "1";
    body.style.padding = "12px";
    body.style.overflow = "auto";

    const pre = document.createElement("pre");
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    pre.style.fontSize = "12px";
    pre.style.lineHeight = "1.45";
    pre.style.color = "#e6e6eb";
    pre.style.opacity = ".92";
    body.appendChild(pre);

    panel.appendChild(top);
    panel.appendChild(body);
    overlay.appendChild(panel);

    function styleMini(b) {
      b.style.padding = "10px 12px";
      b.style.borderRadius = "12px";
      b.style.border = "1px solid rgba(255,255,255,.12)";
      b.style.background = "#0f1220";
      b.style.color = "#e6e6eb";
      b.style.fontWeight = "700";
    }

    function render() {
      const q = (filter.value || "").trim().toLowerCase();
      const logs = getLogs();
      const rows = [];
      for (const it of logs) {
        const line = `${it.ts}  ${it.type}  ${safeJson(it.data)}`;
        if (!q) { rows.push(line); continue; }
        if (it.type.toLowerCase().includes(q) || line.toLowerCase().includes(q)) rows.push(line);
      }
      pre.textContent = rows.join("\n");
      // keep scrolled near bottom by default
      if (!q) body.scrollTop = body.scrollHeight;
    }

    btn.addEventListener("click", () => {
      overlay.style.display = "block";
      render();
    });

    btnClose.addEventListener("click", () => {
      overlay.style.display = "none";
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.style.display = "none";
    });

    filter.addEventListener("input", render);

    btnClear.addEventListener("click", () => {
      clearLogs();
      addLog("log_cleared");
      render();
    });

    btnCopy.addEventListener("click", async () => {
      const text = pre.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        addLog("log_copied", { chars: text.length });
        btnCopy.textContent = "コピー✓";
        setTimeout(() => (btnCopy.textContent = "コピー"), 800);
      } catch (e) {
        addLog("log_copy_failed", { message: String(e) });
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch(_) {}
        document.body.removeChild(ta);
      }
    });

    document.body.appendChild(overlay);
    document.body.appendChild(btn);
  }

  // global errors
  window.addEventListener("error", (ev) => {
    addLog("error", {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    addLog("unhandledrejection", { reason: String(ev.reason) });
  });

  // boot
  addLog("page_load", { path: (location && location.pathname) ? location.pathname : "" });

  // Expose
  window.V12 = {
    addLog,
    getLogs,
    clearLogs,
    pendingSave,
    pendingLoad,
    pendingClear,
    wsUrlFromBase,
    getWsBase,
    createLoggedWebSocket,
    ensureLogUi
  };
})();
