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
  // שורת המקור: נכון ל- · איך זה חושב? — בלי סוג הנתון, ובלי לחזור על מה שכבר כתוב בכרטיס
  // (הכרעת בעלים 12.10.2026: "לא כותבים נתון זהה פעמיים באותו מסך"): תאריך שכבר הופיע — בטקסט או בשורה קודמת —
  // אינו נכתב שוב, וקישור "איך זה חושב?" שכבר הופיע — אינו נכתב שוב. שורה שלא נשאר בה כלום — אינה מוצגת.
  var seenDates, seenUrls, cardText;
  function dateForms(asOf) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(asOf));
    if (!m) return { show: String(asOf), keys: [String(asOf)] };
    var d = String(+m[3]), mo = String(+m[2]);
    // התבנית של האתר: יום/חודש (DESIGN.md, 11.10.2026)
    return { show: d + "/" + mo, keys: [m[0], d + "/" + mo, d + "." + mo + "." + m[1], m[3] + "." + m[2] + "." + m[1], d + "." + mo + "." + m[1].slice(2)] };
  }
  function meta(src) {
    if (!src) return null;
    var f = dateForms(src.asOf);
    var dateKnown = f.keys.some(function (k) { return seenDates[k] || cardText.indexOf(k) >= 0; });
    var linkKnown = !siteLink(src.url) || seenUrls[src.url];
    f.keys.forEach(function (k) { seenDates[k] = true; });
    if (siteLink(src.url)) seenUrls[src.url] = true;
    if (dateKnown && linkKnown) return null;
    var p = el("p", "meta");
    if (!dateKnown) p.appendChild(document.createTextNode("נכון ל-" + f.show + (linkKnown ? "" : " · ")));
    if (!linkKnown) p.appendChild(link("איך זה חושב?", src.url));
    return p;
  }
  function add(parent, child) { if (child) parent.appendChild(child); }
  // טווח מספרים ("47–63") בתוך טקסט עברי — בבידוד משמאל לימין, אחרת הוא מוצג הפוך ("63–47")
  function ltrRanges(t) { return String(t).replace(/(\d[\d.,%]*\s*[–—-]\s*\d[\d.,%]*)/g, "\u2066$1\u2069"); }
  // תיבות המספרים: שורות מאוזנות וממורכזות (4 ⇐ 2+2, 5 ⇐ 3+2), לפי הרוחב שיש
  var grids = [];
  function balance(grid) {
    var n = grid.children.length;
    var max = Math.max(1, Math.floor((grid.clientWidth + 12) / (150 + 12)));
    var rows = Math.ceil(n / max);
    grid.style.setProperty("--cols", String(Math.max(1, Math.ceil(n / rows))));
  }

  function render(a) {
    root.textContent = "";
    seenDates = {}; seenUrls = {}; grids = [];
    cardText = [a.title, a.summary].concat((a.sections || []).map(function (s) { return [s.heading, s.text].concat(s.items && typeof s.items[0] === "string" ? s.items : []).join(" "); })).join(" ");
    var card = el("article", "card");
    card.setAttribute("dir", "rtl");
    card.appendChild(el("p", "site", "בחירות 2026"));
    card.appendChild(el("h2", "title", a.title));
    if (a.summary) card.appendChild(el("p", "summary", a.summary));
    (a.sections || []).forEach(function (s) {
      var sec = el("section", "sec");
      if (s.heading) sec.appendChild(el("h3", "heading", s.heading));
      if (s.kind === "text") {
        String(s.text).split(/\n+/).forEach(function (line) { sec.appendChild(el("p", "text", ltrRanges(line))); });
      } else if (s.kind === "list") {
        var ul = el(s.ordered ? "ol" : "ul", "list");
        (s.items || []).forEach(function (it) { ul.appendChild(el("li", null, ltrRanges(it))); });
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
          r.forEach(function (c) { var td = el("td", /\d/.test(c) ? "num" : null); td.appendChild(el("bdi", null, ltrRanges(c))); tr.appendChild(td); });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        wrap.appendChild(table);
        sec.appendChild(wrap);
      } else if (s.kind === "numbers") {
        var grid = el("div", "numbers");
        var items = s.items || [];
        // כל התיבות מאותו מקור ⇐ שורת מקור אחת לקטע, לא בכל תיבה
        var shared = items.every(function (n) { return n.source && items[0].source && n.source.url === items[0].source.url && n.source.asOf === items[0].source.asOf; });
        items.forEach(function (n) {
          var tile = el("div", "tile");
          tile.appendChild(el("p", "label", n.label));
          var v = el("p", "value tabular");
          v.appendChild(el("bdi", null, ltrRanges(n.value)));
          tile.appendChild(v);
          if (n.detail) tile.appendChild(el("p", "detail tabular", ltrRanges(n.detail)));
          if (!shared) add(tile, meta(n.source));
          grid.appendChild(tile);
        });
        sec.appendChild(grid);
        grids.push(grid);
        var m = shared && items.length ? meta(items[0].source) : null;
        if (m) { m.className = "meta center"; sec.appendChild(m); }
      }
      if (s.source) add(sec, meta(s.source));
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
    grids.forEach(balance);
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
    grids.forEach(balance);
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
