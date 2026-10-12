// כרטיס התשובה של שרת ה-MCP (MCP Apps, מפרט 2026-01-26) — רץ בתוך המסגרת של העוזר (Claude, ChatGPT).
// 🔴 אין לכרטיס רשת ואין לו אסימון: הוא מציג רק את התשובה ש-show_answer בדק בשרת (structuredContent).
// 🔴 טקסט מוצג כטקסט בלבד (textContent), בלי HTML מהתשובה. קישורים נפתחים רק לאתר עצמו, דרך המארח (ui/open-link).
(function () {
  "use strict";
  var SITE = "__SITE__";
  var root = document.getElementById("app");
  var pending = {};
  var nextId = 1;
  var rendered = false;

  function post(msg) { window.parent.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*"); }
  function request(method, params, timeout) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      var t = timeout ? setTimeout(function () { delete pending[id]; reject(new Error("timeout")); }, timeout) : null;
      pending[id] = function (err, res) { if (t) clearTimeout(t); if (err) reject(err); else resolve(res || {}); };
      post({ id: id, method: method, params: params });
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function setTheme(ctx) {
    var t = ctx && ctx.theme;
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  }
  function siteLink(url) { return typeof url === "string" && url.indexOf(SITE) === 0; }
  function openLink(url) {
    if (!siteLink(url)) return;
    request("ui/open-link", { url: url }).catch(function () { window.open(url, "_blank", "noopener"); });
  }
  function link(text, url) {
    var a = el("a", "link", text);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", function (ev) { ev.preventDefault(); openLink(url); });
    return a;
  }
  // שורת המקור, כמו Explained באתר: סוג · נכון ל- · איך זה חושב?
  function meta(src) {
    var p = el("p", "meta");
    if (!src) return p;
    p.appendChild(document.createTextNode(src.kind + " · " + src.asOf + " · "));
    if (siteLink(src.url)) p.appendChild(link("איך זה חושב?", src.url));
    return p;
  }

  function render(a) {
    root.textContent = "";
    var card = el("article", "card");
    card.setAttribute("dir", "rtl");
    card.appendChild(el("p", "site", "בחירות 2026 — ניתוח"));
    card.appendChild(el("h2", "title", a.title));
    if (a.summary) card.appendChild(el("p", "summary", a.summary));
    (a.sections || []).forEach(function (s) {
      var sec = el("section", "sec");
      if (s.heading) sec.appendChild(el("h3", "heading", s.heading));
      if (s.kind === "text") {
        String(s.text).split(/\n+/).forEach(function (line) { sec.appendChild(el("p", "text", line)); });
      } else if (s.kind === "list") {
        var ul = el(s.ordered ? "ol" : "ul", "list");
        (s.items || []).forEach(function (it) { ul.appendChild(el("li", null, it)); });
        sec.appendChild(ul);
      } else if (s.kind === "table") {
        var wrap = el("div", "tablewrap");
        var table = el("table", "table tabular");
        var thead = el("thead");
        var hr = el("tr");
        (s.columns || []).forEach(function (c) { var th = el("th", null, c); th.scope = "col"; hr.appendChild(th); });
        thead.appendChild(hr);
        table.appendChild(thead);
        var tb = el("tbody");
        (s.rows || []).forEach(function (r) {
          var tr = el("tr");
          r.forEach(function (c) { var td = el("td", /\d/.test(c) ? "num" : null); td.appendChild(el("bdi", null, c)); tr.appendChild(td); });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        wrap.appendChild(table);
        sec.appendChild(wrap);
      } else if (s.kind === "numbers") {
        var grid = el("div", "numbers");
        (s.items || []).forEach(function (n) {
          var tile = el("div", "tile");
          tile.appendChild(el("p", "label", n.label));
          var v = el("p", "value tabular");
          v.appendChild(el("bdi", null, n.value));
          tile.appendChild(v);
          tile.appendChild(meta(n.source));
          grid.appendChild(tile);
        });
        sec.appendChild(grid);
      }
      if (s.source) sec.appendChild(meta(s.source));
      card.appendChild(sec);
    });
    if (a.suggested_questions && a.suggested_questions.length) {
      var q = el("div", "questions");
      q.appendChild(el("p", "qtitle", "שאלות להמשך"));
      a.suggested_questions.forEach(function (text) {
        var b = el("button", "chip", text);
        b.type = "button";
        b.addEventListener("click", function () {
          request("ui/message", { role: "user", content: [{ type: "text", text: text }] }, 4000).catch(function () {
            if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
            b.textContent = text + " (הועתק — הדביקו בשיחה)";
          });
        });
        q.appendChild(b);
      });
      card.appendChild(q);
    }
    var foot = el("footer", "foot");
    if (a.footnote) foot.appendChild(el("p", "footnote", a.footnote));
    foot.appendChild(link("מעבר לאתר", SITE));
    card.appendChild(foot);
    root.appendChild(card);
    rendered = true;
  }

  function onResult(params) {
    var sc = params && params.structuredContent;
    if (params && params.isError) return; // ניסיון שנדחה — המודל מתקן ושולח שוב; מציגים רק את התשובה הסופית
    if (sc && sc.answer && sc.answer.title) render(sc.answer);
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;
    var m = ev.data || {};
    if (m.jsonrpc !== "2.0") return;
    if (!m.method && typeof m.id === "number" && pending[m.id]) {
      var cb = pending[m.id];
      delete pending[m.id];
      cb(m.error ? new Error(m.error.message || "error") : null, m.result);
      return;
    }
    switch (m.method) {
      case "ui/notifications/tool-result": onResult(m.params); return;
      case "ui/notifications/host-context-changed": setTheme(m.params); return;
      case "ui/notifications/tool-input": case "ui/notifications/tool-input-partial": case "ui/notifications/tool-cancelled": return;
      case "ui/resource-teardown": post({ id: m.id, result: {} }); return;
      case "ping": post({ id: m.id, result: {} }); return;
      default: if (m.method && m.id !== undefined) post({ id: m.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  // הגובה האמיתי של התוכן, כדי שהמארח יתאים את המסגרת (בלי גלילה פנימית)
  var last = -1;
  function size() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h !== last) { last = h; post({ method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: h } }); }
  }
  if (window.ResizeObserver) new ResizeObserver(size).observe(document.body);

  request("ui/initialize", { appInfo: { name: "elections26-answer-card", version: "1.0.0" }, appCapabilities: { availableDisplayModes: ["inline"] }, protocolVersion: "2026-01-26" })
    .then(function (res) { setTheme(res.hostContext); post({ method: "ui/notifications/initialized" }); size(); })
    .catch(function () {});
  // לבדיקה בדפדפן: ?demo מציג תשובה לדוגמה
  if (window.__DEMO__) render(window.__DEMO__);
  void rendered;
})();
