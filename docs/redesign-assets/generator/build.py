#!/usr/bin/env python3
"""מחולל הדגמות העיצוב מחדש (docs/עיצוב-מחדש-מחקר-והצעה.md, גרסה 2). אינו חלק מהאתר ואינו רץ ב-CI.
הרצה מחדש: npx vite-node docs/redesign-assets/generator/extract.ts > docs/redesign-assets/generator/home-data.json
            python3 docs/redesign-assets/generator/build.py
כל המספרים מגיעים מנתוני האתר עצמו:
 - מסך הבית: model.json דרך הפונקציות של האתר (extract.ts → home-data.json) ושינוי 7 ימים מ-trend
 - גרף הסקרים מול התוצאות: history.json (בחירות 2022) ו-results.json
הפלט: קבצי HTML עצמאיים ב-docs/redesign-assets (ה-CSS המשותף מוטמע):
 home-proposal, accuracy-proposal, chart-kit, method-proposal, ui-kit (גופנים, כרטיסים ומתגים), tokens-sheet."""
import json, math, pathlib
from datetime import date, timedelta

GEN = pathlib.Path(__file__).parent
REPO = GEN.parents[2]
OUT = GEN.parent
OUT.mkdir(parents=True, exist_ok=True)
CSS = (GEN / "shared.css").read_text(encoding="utf-8")
D = json.loads((GEN / "home-data.json").read_text(encoding="utf-8"))
MODEL = json.loads((REPO / "src/data/model.json").read_text(encoding="utf-8"))

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@700;900&display=swap" rel="stylesheet">')
FONTS_OLD = ('<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Karantina:wght@400;700&family=Secular+One&display=swap" rel="stylesheet">')

BOOT = """<script>(function(){var q=new URLSearchParams(location.search),d=document.documentElement;
d.dataset.theme=q.get('theme')==='board'?'board':'league';var m=q.get('mode');
if(m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))d.dataset.dark='';
if(q.get('card'))d.dataset.card='';if(q.get('static'))d.dataset.static='';if(q.get('more'))d.dataset.more='';})();</script>"""


def page(title, body, extra_css="", boot=True, extra_head=""):
    return f"""<!doctype html>
<html lang="he" dir="rtl" data-theme="league">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>{FONTS}{extra_head}
<style>{CSS}
{extra_css}</style>{BOOT if boot else ""}</head>
<body>{body}</body></html>"""


def L(s):
    """טווח או מספר שחייב להישאר משמאל לימין בתוך משפט עברי"""
    return f'<span class="ltr">{s}</span>'


ICONS = {
    "home": '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    "board": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    "bars": '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    "guess": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6M7 16h8"/>',
    "comments": '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8h10M7 12h7"/>',
    "more": '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "sliders": '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    "chev": '<path d="M15 6l-6 6 6 6"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
}


def svg(name, cls=""):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>')


# ---------- 120 מושבים: אותה גיאומטריה כמו SeatBoard.tsx ----------
def largest_remainder(total, weights):
    W = sum(weights)
    q = [total * w / W for w in weights]
    out = [math.floor(x + 1e-9) for x in q]
    rem = sorted(range(len(q)), key=lambda i: (-(q[i] - out[i]), -weights[i], i))
    given, i = sum(out), 0
    while given < total:
        out[rem[i % len(rem)]] += 1
        given += 1
        i += 1
    return out


def seats_geometry(rows=6, total=120):
    radii = [0.44 + i * 0.56 / (rows - 1) for i in range(rows)]
    per = largest_remainder(total, radii)
    seats = []
    for r, n in zip(radii, per):
        for k in range(n):
            seats.append((math.pi / 2 if n == 1 else k / (n - 1) * math.pi, r))
    seats.sort(key=lambda s: (s[0], -s[1]))
    return seats


def hemicycle(groups, major=61):
    seats = seats_geometry()
    X0, Y0 = 1.1, 1.26
    fills = []
    for cls, n, *_ in groups:
        fills += [cls] * n
    circles = [f'<circle class="{f}" cx="{X0 + r * math.cos(a):.4f}" cy="{Y0 - r * math.sin(a):.4f}" r="0.038"/>' for (a, r), f in zip(seats, fills)]
    a_t = (seats[major - 1][0] + seats[major][0]) / 2
    tick = (f'<line class="tick" x1="{X0 + 1.045 * math.cos(a_t):.4f}" y1="{Y0 - 1.045 * math.sin(a_t):.4f}" '
            f'x2="{X0 + 1.14 * math.cos(a_t):.4f}" y2="{Y0 - 1.14 * math.sin(a_t):.4f}"/>')
    x61, y61 = X0 + 1.22 * math.cos(a_t), Y0 - 1.22 * math.sin(a_t)
    labels = (f'<span class="hl" style="left:{x61 / 2.2 * 100:.2f}%;top:{y61 / 1.32 * 100:.2f}%" aria-hidden="true">{major}</span>'
              f'<span class="hl hl-total" style="left:50%;top:{(Y0 - 0.06) / 1.32 * 100:.2f}%" aria-hidden="true">120 מושבים</span>')
    chart = ('<svg viewBox="0 0 2.2 1.32" role="img" aria-label="120 המושבים בחצי עיגול: '
             + "; ".join(g[2] for g in groups) + f'. הקו מסמן את המושב ה-{major}, הרוב.">' + "".join(circles) + tick + "</svg>")
    return chart + labels


def fmt_date(iso):
    y, m, d = iso.split("-")
    return f"{int(d)}.{int(m)}.{y}"


# =====================================================================
# נתונים משותפים
# =====================================================================
rows = D["rows"]
NAME = {r["id"]: r["name"] for r in rows}
# הכותרת והלוח: מנדטי הממשלה היוצאת כפי שהאתר מציג ("בחציון התרחישים", bloc.seats[1]).
# סכום הממוצעים של הרשימות (gov_sum) יכול להיות שונה ב-1 — ממצא שנרשם במסמך (החלטה 14); לא מחושב מחדש כאן.
glo, gmid, ghi = D["bloc"]["seats"]
gov_n = gmid
gov_sum = sum(r["central"] for r in rows if r["gov"])
oth_n = 120 - gov_n
edge = [r for r in rows if (not r["sure"]) and 0.005 < r["pass"] < 0.995]
below = [r for r in rows if r["pass"] <= 0.005]
safe = [r for r in rows if r["central"] > 0 and r not in edge]
asof = fmt_date(D["asOf"])
start_d = D["start"]
sd = f"{int(start_d[8:])}.{int(start_d[5:7])}"
hemi_groups = [("seat-a", gov_n, f"{gov_n} למפלגות הממשלה היוצאת"), ("seat-b", oth_n, f"{oth_n} לשאר הרשימות")]
GOV_IDS = [r["id"] for r in rows if r["gov"]]
series = [(t["date"], sum(t["seats"].get(i, 0) for i in GOV_IDS)) for t in MODEL["trend"]]
s_min, s_max = min(v for _, v in series), max(v for _, v in series)

MAXV = 30
ticks_home = "".join(f'<span style="left:{v / MAXV * 100:.2f}%">{v}</span>' for v in (0, 10, 20, 30))


def dots(p):
    k = round(p * 10)
    return '<span class="dots" aria-hidden="true">' + "<i></i>" * k + '<i class="off"></i>' * (10 - k) + "</span>", k


def rank_row(r, with_dots=False):
    lo, hi, c = r["lo"], r["hi"], r["central"]
    width = max((hi - lo) / MAXV * 100, 0.8)
    dl = ""
    if with_dots:
        d, k = dots(r["pass"])
        dl = f'<span class="dl">{d}<span>עוברת ב-{round(r["pass"] * 100)}% מהתרחישים</span></span>'
    return (f'<li class="row{" tall" if with_dots else ""}"><span class="nm">{r["name"]}</span><span class="n num">{c}</span>'
            f'<span class="plot" aria-hidden="true"><span class="bar" style="left:{lo / MAXV * 100:.2f}%;width:{width:.2f}%"></span>'
            f'<span class="dot" style="left:{c / MAXV * 100:.2f}%"></span></span>'
            f'<span class="rng">{L(f"{lo}–{hi}")}</span>{dl}<span class="sr">; טווח {lo} עד {hi}</span></li>')


def ranking_block(title="כל הרשימות"):
    return (f'<h2 class="h2" id="h-rank">{title}</h2>'
            '<div class="key"><span><i class="k-dot"></i>ממוצע הסקרים</span><span><i class="k-bar"></i>טווח 80% מהתרחישים</span></div>'
            f'<div class="axisrow" aria-hidden="true"><div class="ticks">{ticks_home}</div></div>'
            f'<ol class="rank">{"".join(rank_row(r) for r in safe)}</ol>'
            '<div class="thr" role="separator" aria-label="קו אחוז החסימה, 3.25%">אחוז החסימה 3.25%</div>'
            f'<ol class="rank">{"".join(rank_row(r, True) for r in edge)}</ol>'
            f'<p class="below">מתחת לסף: {", ".join(r["name"] for r in below)}</p>')


def tchart():
    """קו הממשלה היוצאת לאורך זמן, קו 61 ורצועת 80% ביום הבחירות. SVG בקנה מידה חופשי, תוויות ב-HTML."""
    n = len(series)
    X0, X1, YT, YB, VMIN, VMAX = 3.0, 86.0, 6.0, 84.0, 44, 64

    def X(i):
        return X0 + (X1 - X0) * i / (n - 1)

    def Y(v):
        return YB - (YB - YT) * (v - VMIN) / (VMAX - VMIN)

    pts = " ".join(f"{X(i):.2f},{Y(v):.2f}" for i, (_, v) in enumerate(series))
    grid = "".join(f'<line class="gl" x1="{X0}" x2="100" y1="{Y(v):.2f}" y2="{Y(v):.2f}"/>' for v in (50, 55))
    ref = f'<line class="ref" x1="{X0}" x2="100" y1="{Y(61):.2f}" y2="{Y(61):.2f}"/>'
    wh = (f'<line class="wh" x1="{X1}" x2="{X1}" y1="{Y(glo):.2f}" y2="{Y(ghi):.2f}"/>'
          f'<line class="wh" x1="{X1 - 2}" x2="{X1 + 2}" y1="{Y(ghi):.2f}" y2="{Y(ghi):.2f}"/>'
          f'<line class="wh" x1="{X1 - 2}" x2="{X1 + 2}" y1="{Y(glo):.2f}" y2="{Y(glo):.2f}"/>')
    sv = f'<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="הממשלה היוצאת: {s_min} עד {s_max} מנדטים בממוצע מאז {sd}; קו 61 מסמן את הרוב">{grid}{ref}<polyline class="ln" points="{pts}"/>{wh}</svg>'
    lab = (f'<span class="tl big" style="left:95%;top:{Y(61) - 7:.2f}%">61</span>'
           f'<span class="tl" style="left:{X1 + 6:.2f}%;top:{Y(ghi):.2f}%">{ghi}</span>'
           f'<span class="tl" style="left:{X1 + 6:.2f}%;top:{Y(glo):.2f}%">{glo}</span>'
           f'<span class="tl soft" style="left:{X0 + 2:.2f}%;top:88%">{sd}</span>'
           f'<span class="tl soft" style="left:{X1:.2f}%;top:88%">{int(D["asOf"][8:])}.{int(D["asOf"][5:7])}</span>')
    return f'<div class="tchart">{sv}{lab}</div>'


SHEET = ["המצב והתרחישים", "סקרים ומגמות", "בחירות קודמות", "מה השתנה מהבחירות האחרונות", "שיטה, מקורות ואודות"]
NAV = [("בית", True), ("הכנסת שלי", False), ("סקר האתר", False), ("המצב והתרחישים", False), ("סקרים ומגמות", False),
       ("בחירות קודמות", False), ("מה השתנה", False), ("שיטה ומקורות", False), ("תמיכה", False)]
TABS = [("בית", "home", "home"), ("הכנסת שלי", "guess", "guess"), ("עוד", "more", "more"), ("סקר האתר", "bars", "community"), ("תמיכה", "comments", "support")]


def _cur(c):
    return ' aria-current="page"' if c else ""


def top_bar(count='עוד <b class="num">18</b> ימים', nav=True):
    items = "".join(f'<li><a href="#"{_cur(cur)}>{n}</a></li>' for n, cur in NAV)
    nav_html = f'<nav class="navd" aria-label="ניווט ראשי"><ul>{items}</ul></nav>' if nav else ""
    return (f'<header class="top"><div class="top-in"><a class="brand" href="#">בחירות 26</a>{nav_html}<span class="spacer"></span>'
            f'<span class="count">{count}</span><button class="icon-btn" type="button" aria-label="תצוגה: עיצוב ויום או לילה">{svg("sliders")}</button></div></header>')


def tabs_bar(active="home"):
    """חמש לשוניות. "עוד" פותחת חלון עם כל המסכים שאינם בסרגל (SHEET)."""
    items = []
    for n, ic, key in TABS:
        cur = key == active
        if key == "more":
            items.append(f'<li><button type="button" class="more" aria-haspopup="dialog" aria-controls="more-sheet"{_cur(cur)}>{svg(ic)}{n}</button></li>')
        else:
            items.append(f'<li><a href="#"{_cur(cur)}>{svg(ic)}{n}</a></li>')
    sheet = ("".join(f'<li><a href="#">{s}</a></li>' for s in SHEET))
    return (f'<nav class="tabs" aria-label="ניווט בטלפון"><ul>{"".join(items)}</ul></nav>'
            '<div class="scrim" aria-hidden="true"></div>'
            f'<section class="sheet" id="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-t"><div class="sheet-h"><h2 id="more-t">עוד</h2>'
            f'<button type="button" class="icon-btn sheet-x" aria-label="סגירה">{svg("close")}</button></div><ul>{sheet}</ul></section>'
            "<script>(function(){var d=document.documentElement,m=document.querySelector('.tabs .more');if(!m)return;"
            "m.addEventListener('click',function(){d.toggleAttribute('data-more');});"
            "document.querySelector('.scrim').addEventListener('click',function(){d.removeAttribute('data-more');});"
            "document.querySelector('.sheet-x').addEventListener('click',function(){d.removeAttribute('data-more');});})();</script>")


def asof_line(extra=""):
    return f'<p class="asof">נכון ל-{asof}{extra} · <a href="#">איך זה חושב?</a></p>'


# =====================================================================
# 1. מסך הבית המוצע (גרסה 2)
# =====================================================================
HOME_EXTRA = """
@media (min-width: 1024px) {
  .hero { grid-template-areas: "head hemi" "facts hemi"; row-gap: .5rem; }
  .hero-head { grid-area: head; align-self: end; }
  .hemi { grid-area: hemi; align-self: center; }
  .hero-facts { grid-area: facts; align-self: start; }
  .body { grid-template-areas: "trend rank" "cta rank"; }
  .body .trend-sec { grid-area: trend; margin-top: 2.5rem; }
  .body .cta { grid-area: cta; }
}
"""
home_body = f"""
{top_bar()}
<main id="main">
  <section class="hero" aria-labelledby="h1">
    <div class="hero-head"><h1 class="h1" id="h1">מפלגות הממשלה היוצאת: {gov_n} מנדטים. לרוב דרושים 61.</h1></div>
    <figure class="hemi" style="margin-inline:0">{hemicycle(hemi_groups)}</figure>
    <div class="hero-facts">
      <p class="leg1"><span><i class="sw a"></i>הממשלה היוצאת <b class="num">{gov_n}</b></span><span><i class="sw b"></i>כל השאר <b class="num">{oth_n}</b></span></p>
      {asof_line(f" · {D['polls']} סקרים")}
    </div>
  </section>
  <div class="body">
    <section class="sec rank-sec" aria-labelledby="h-rank">{ranking_block()}</section>
    <section class="sec trend-sec" aria-labelledby="h-trend">
      <h2 class="h2" id="h-trend">הממשלה היוצאת: {s_min} עד {s_max} מנדטים מאז {sd}</h2>
      {tchart()}
      <div class="key"><span><i class="k-bar"></i>טווח 80% ליום הבחירות</span></div>
    </section>
    <aside class="cta mini" aria-labelledby="h-cta">
      <h2 id="h-cta">כמה תקבל כל רשימה? תנחשו.</h2>
      <a class="btn" href="#">לבנות את הכנסת שלי</a>
      <p>השערות גולשים, אינן סקר.</p>
    </aside>
  </div>
</main>
{tabs_bar()}
"""
(OUT / "home-proposal.html").write_text(page("בחירות 26: מסך בית מוצע", home_body, HOME_EXTRA), encoding="utf-8")

# =====================================================================
# 2. הסקרים מול התוצאות (בחירות 2022): גרף סטייה
# =====================================================================
H = json.loads((REPO / "src/data/history.json").read_text(encoding="utf-8"))
R = json.loads((REPO / "src/data/results.json").read_text(encoding="utf-8"))
cyc = next(c for c in H["cycles"] if c["id"] == "k25")
res = next(c for c in R if c["id"] == "k25")
actual = {l["letters"]: l for l in res["lists"]}
CH = [("כאן 11", "כאן 11", "קנטר"), ("חדשות 12", "חדשות 12", "מדגם מחקר וייעוץ"), ("חדשות 13", "חדשות 13", "קמיל פוקס"), ("ערוץ 14", "ערוץ 14", "דיירקט פולס")]
final = {}
for name, pub, firm in CH:
    final[name] = max([p for p in cyc["polls"] if p["publisherHe"] == pub and p["firmHe"] == firm], key=lambda p: p["end"])
LET = [("מחל", "הליכוד"), ("פה", "יש עתיד"), ("ט", "הציונות הדתית ועוצמה יהודית"), ("כן", "המחנה הממלכתי"), ("שס", 'ש"ס'), ("ג", "יהדות התורה"), ("ל", "ישראל ביתנו"), ("עם", 'רע"ם'), ("ום", 'חד"ש-תע"ל'), ("אמת", "העבודה"), ("מרצ", "מרצ")]
acc = []
for let, nm in LET:
    vals = [final[c[0]]["values"][let]["s"] for c in CH]
    a = actual[let]["seats"]
    lo, hi = min(vals), max(vals)
    miss = 0 if lo <= a <= hi else (a - hi if a > hi else a - lo)
    acc.append(dict(let=let, name=nm, vals=vals, lo=lo, hi=hi, mean=sum(vals) / len(vals), actual=a, miss=miss, votes=actual[let]["votes"]))
valid = res["valid"]
out_rows = sorted([x for x in acc if x["miss"] != 0], key=lambda x: -abs(x["miss"]))
in_rows = sorted([x for x in acc if x["miss"] == 0], key=lambda x: -x["actual"])
n_in, n_all = len(in_rows), len(acc)
meretz = next(x for x in acc if x["let"] == "מרצ")
thr = 100 * meretz["votes"] / valid
assert meretz["actual"] == 0
assert {x["name"] for x in out_rows} == {'ש"ס', 'רע"ם', 'חד"ש-תע"ל', 'מרצ'}, [x["name"] for x in out_rows]
assert all(x["miss"] > 0 for x in out_rows if x["let"] != "מרצ")
dates = {c[0]: final[c[0]]["end"] for c in CH}
AMIN, AMAX = -5, 4
span = AMAX - AMIN


def pos(v):
    return (v - AMIN) / span * 100


def acc_row(x):
    out = x["miss"] != 0
    lo, hi = x["lo"] - x["mean"], x["hi"] - x["mean"]
    rng = f'{x["lo"]}' if x["lo"] == x["hi"] else f'{x["lo"]}–{x["hi"]}'
    sub = f'<small class="why">מתחת לסף: {thr:.2f}%</small>' if x["let"] == "מרצ" else ""
    grid = "".join(f'<i class="g{" z" if v == 0 else ""}" style="left:{pos(v):.2f}%"></i>' for v in (-4, -2, 0, 2, 4))
    return (f'<li class="arow{" out" if out else ""}"><span class="nm">{x["name"]}{sub}</span>'
            f'<span class="dplot" aria-hidden="true">{grid}<span class="bar" style="left:{pos(lo):.2f}%;width:{max((hi - lo) / span * 100, 1.2):.2f}%"></span>'
            f'<span class="dot{" sig" if out else ""}" style="left:{pos(x["actual"] - x["mean"]):.2f}%"></span></span>'
            f'<span class="av"><b class="num">{x["actual"]}</b><small>סקרים {L(rng)}</small></span></li>')


def table():
    head = "".join(f"<th>{c[0]}</th>" for c in CH)
    body = "".join(f'<tr><th scope="row">{x["name"]}</th>' + "".join(f'<td class="num">{v}</td>' for v in x["vals"]) + f'<td class="num"><b>{x["actual"]}</b></td></tr>'
                   for x in sorted(acc, key=lambda x: -x["actual"]))
    return f'<table class="tbl"><thead><tr><th>רשימה</th>{head}<th>תוצאה</th></tr></thead><tbody>{body}</tbody></table>'


ACC_EXTRA = """
.wrap { padding: 1.25rem 1rem 2.5rem; max-width: 64rem; margin: 0 auto; }
html[data-card] .wrap { padding: 2.2rem 2.4rem 2rem; max-width: none; }
.acc-h { font-family: var(--font-display), var(--font-body), sans-serif; font-weight: var(--display-weight); font-size: var(--hero); line-height: 1.06; margin: 0; text-wrap: balance; }
.grp { margin: 1.25rem 0 .25rem; font-size: 1rem; font-weight: 800; }
.arows { list-style: none; margin: 0; padding: 0; }
.arow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; align-items: center; gap: .1rem .75rem; padding: .5rem 0; border-top: 1px solid rgb(var(--line)); }
.arow:last-child { border-bottom: 1px solid rgb(var(--line)); }
.arow .nm { font-weight: 600; line-height: 1.25; }
.arow .nm .why { display: block; font-size: .75rem; font-weight: 400; color: rgb(var(--ink-soft)); }
.dplot { position: relative; height: 1.5rem; direction: ltr; }
.dplot i.g { position: absolute; top: 0; bottom: 0; width: 1px; background: rgb(var(--line)); }
.dplot i.z { background: rgb(var(--ink-faint)); width: 1.5px; }
.dplot .bar { position: absolute; top: 50%; height: .35rem; margin-top: -.175rem; border-radius: 99px; background: rgb(var(--accent) / .7); }
.dplot .dot { position: absolute; top: 50%; width: .95rem; height: .95rem; margin: -.475rem 0 0 -.475rem; border-radius: 50%; background: rgb(var(--ink)); box-shadow: 0 0 0 2px rgb(var(--paper)); }
.dplot .dot.sig { background: rgb(var(--signal)); box-shadow: 0 0 0 2px rgb(var(--paper)), 0 0 0 3.5px rgb(var(--ink)); }
.arow .av { text-align: end; line-height: 1.1; }
.arow .av b { font-size: 1.25rem; font-weight: 800; display: block; }
.arow .av small { font-size: .75rem; color: rgb(var(--ink-soft)); white-space: nowrap; }
.arow.out .nm { font-weight: 800; }
.axis { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; gap: .1rem .75rem; font-size: .75rem; color: rgb(var(--ink-soft)); margin-top: .5rem; }
.axis .ticks { grid-column: 2; position: relative; height: 1rem; direction: ltr; }
.axis .ticks span { position: absolute; transform: translateX(-50%); }
.axis .ends { grid-column: 2; display: flex; justify-content: space-between; direction: ltr; font-weight: 700; }
.k-dot.sig { background: rgb(var(--signal)); box-shadow: 0 0 0 2px rgb(var(--paper)), 0 0 0 3.5px rgb(var(--ink)); }
.depth { margin-top: 1.25rem; border-top: 1px solid rgb(var(--line)); }
.depth summary { cursor: pointer; padding: .9rem 0; font-weight: 700; min-height: 3rem; list-style: none; display: flex; justify-content: space-between; }
.depth summary::-webkit-details-marker { display: none; }
.depth summary::after { content: "+"; font-size: 1.4rem; line-height: 1; color: rgb(var(--ink-soft)); }
.depth[open] summary::after { content: "−"; }
.tbl { width: 100%; border-collapse: collapse; font-size: .875rem; }
.tbl th, .tbl td { padding: .45rem .3rem; border-top: 1px solid rgb(var(--line)); text-align: center; }
.tbl th:first-child { text-align: start; font-weight: 600; }
.tbl thead th { font-size: .75rem; color: rgb(var(--ink-soft)); font-weight: 600; }
.cardfoot { display: none; }
html[data-card] .cardfoot { display: flex; justify-content: space-between; margin-top: 1.2rem; padding-top: .8rem; border-top: 1px solid rgb(var(--line)); font-size: .75rem; color: rgb(var(--ink-soft)); }
html[data-card] .top, html[data-card] .depth, html[data-card] .asof { display: none; }
html[data-card] .acc-h { font-size: 2.3rem; }
@media (min-width: 1024px) { html:not([data-card]) .arow { grid-template-columns: 13rem minmax(0, 1fr) 6rem; } html:not([data-card]) .axis { grid-template-columns: 13rem minmax(0, 1fr) 6rem; } }
"""
ticks = "".join(f'<span style="left:{pos(v):.2f}%">{("+" if v > 0 else "−" if v < 0 else "")}{abs(v)}</span>' for v in (-4, -2, 0, 2, 4))
acc_body = f"""
{top_bar(count="בחירות קודמות: 2022", nav=False)}
<main class="wrap" id="main">
  <h1 class="acc-h">ב-{len(out_rows)} מתוך {n_all} רשימות התוצאה יצאה מחוץ לטווח הסקרים</h1>
  <div class="key" style="margin-top:1rem"><span><i class="k-bar"></i>טווח 4 הסקרים האחרונים</span><span><i class="k-dot"></i>תוצאה, בתוך הטווח</span><span><i class="k-dot sig"></i>תוצאה, מחוץ לטווח</span></div>
  <div class="axis" aria-hidden="true"><div class="ticks">{ticks}</div><div class="ends"><span>פחות</span><span>יותר</span></div></div>
  <h2 class="grp">מחוץ לטווח</h2>
  <ul class="arows">{''.join(acc_row(x) for x in out_rows)}</ul>
  <h2 class="grp">בתוך הטווח</h2>
  <ul class="arows">{''.join(acc_row(x) for x in in_rows)}</ul>
  <details class="depth"><summary>הצגה כטבלה</summary>{table()}</details>
  <p class="asof">הסקר האחרון של כאן 11, חדשות 12, חדשות 13 וערוץ 14 · <a href="#">איך זה חושב?</a></p>
  <div class="cardfoot"><span>בחירות 26 · בחירות לכנסת ה-25</span><span>הסקרים מול התוצאות</span></div>
</main>
{tabs_bar("more")}
<script>if(location.search.indexOf('table=1')>-1){{var d=document.querySelector('.depth');if(d)d.setAttribute('open','');}}</script>
"""
(OUT / "accuracy-proposal.html").write_text(page("בחירות 26: הסקרים מול התוצאות", acc_body, ACC_EXTRA), encoding="utf-8")

# =====================================================================
# 3. ערכת הגרפים
# =====================================================================
fams = MODEL["changes"]["alternatives"][0]["families"]
DBMAX = 35


def fam_name(f):
    return " + ".join(NAME[i] for i in f["k26"])


def db_row(f):
    a, b = f["seats2022"], f["seatsNow"]
    lo, mid, hi = f["seatsRange"]
    d = b - a
    sd_ = "0" if d == 0 else f'{"+" if d > 0 else "−"}{abs(d)}'
    grid = "".join(f'<i class="g" style="left:{v / DBMAX * 100:.2f}%"></i>' for v in (0, 10, 20, 30))
    l, r_ = min(a, b), max(a, b)
    return (f'<li class="drow"><span class="nm">{fam_name(f)}<small>ב-2022: {" + ".join(f["k25"])}</small></span>'
            f'<span class="dbplot" aria-hidden="true">{grid}<span class="rg" style="left:{lo / DBMAX * 100:.2f}%;width:{max((hi - lo) / DBMAX * 100, 1):.2f}%"></span>'
            f'<span class="ln2" style="left:{l / DBMAX * 100:.2f}%;width:{(r_ - l) / DBMAX * 100:.2f}%"></span>'
            f'<span class="d22" style="left:{a / DBMAX * 100:.2f}%"></span><span class="dnow" style="left:{b / DBMAX * 100:.2f}%"></span></span>'
            f'<span class="av"><b class="num">{L(sd_)}</b><small>מ-{a} ל-{b}</small></span></li>')


fams_sorted = sorted(fams, key=lambda f: -abs(f["seatsNow"] - f["seats2022"]))
up = sum(1 for f in fams if f["seatsNow"] > f["seats2022"])
dn = sum(1 for f in fams if f["seatsNow"] < f["seats2022"])
same = len(fams) - up - dn
num_w = {1: "אחת", 2: "שתיים", 3: "שלוש", 4: "ארבע", 5: "חמש", 6: "שש"}
find_changes = f"{num_w[up]} משפחות עלו, {num_w[dn]} ירדו{', ' + num_w[same] + ' ללא שינוי' if same else ''}"
dticks = "".join(f'<span style="left:{v / DBMAX * 100:.2f}%">{v}</span>' for v in (0, 10, 20, 30))

KIT_EXTRA = ACC_EXTRA.split("@media")[0] + """
.kit .axisrow { grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; }
.kit .axisrow .ticks { grid-column: 2; }
.kit .dax { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; gap: .75rem; font-size: .75rem; color: rgb(var(--ink-soft)); margin-top: .5rem; }
.kit .dax .ticks { grid-column: 2; position: relative; height: 1rem; direction: ltr; }
.kit .dax .ticks span { position: absolute; transform: translateX(-50%); }
body { background: rgb(var(--paper)); }
"""
kit_acc_rows = "".join(acc_row(x) for x in out_rows[:2] + in_rows[:2])
kit_body = f"""
<main class="kit" id="main">
  <section class="plate"><h2 class="ft">הכנסת: הממשלה היוצאת {gov_n}, כל השאר {oth_n}</h2>
    <figure class="hemi" style="margin-inline:0">{hemicycle(hemi_groups)}</figure>
    <p class="leg1"><span><i class="sw a"></i>הממשלה היוצאת <b class="num">{gov_n}</b></span><span><i class="sw b"></i>כל השאר <b class="num">{oth_n}</b></span></p>
    <p class="use">לוח מושבים: תמונת מצב אחת של 120. הקו מסמן את המושב ה-61. הגוון הבהיר עם מסגרת.</p></section>
  <section class="plate"><h2 class="ft">ממוצע וטווח לכל רשימה</h2>
    <div class="key"><span><i class="k-dot"></i>ממוצע הסקרים</span><span><i class="k-bar"></i>טווח 80% מהתרחישים</span></div>
    <div class="axisrow" aria-hidden="true"><div class="ticks">{ticks_home}</div></div>
    <ol class="rank">{"".join(rank_row(r) for r in safe[:4])}</ol><div class="thr">אחוז החסימה 3.25%</div><ol class="rank">{"".join(rank_row(r, True) for r in edge[:1])}</ol>
    <p class="use">נקודה על פס: ערך וטווח לכל רשימה. מתחת לקו הסף: עשר נקודות (תדירות) במקום אחוז.</p></section>
  <section class="plate"><h2 class="ft">הממשלה היוצאת: {s_min} עד {s_max} מנדטים מאז {sd}</h2>
    {tchart()}<div class="key"><span><i class="k-bar"></i>טווח 80% ליום הבחירות</span></div>
    <p class="use">קו בזמן: ציר משמאל לימין, קו ייחוס מקווקו (61), תוויות ישירות, בלי מקרא.</p></section>
  <section class="plate"><h2 class="ft">סקרים מול תוצאה: ב-{len(out_rows)} מתוך {n_all} מחוץ לטווח</h2>
    <div class="key"><span><i class="k-bar"></i>טווח 4 הסקרים</span><span><i class="k-dot"></i>בתוך</span><span><i class="k-dot sig"></i>מחוץ</span></div>
    <div class="axis" aria-hidden="true"><div class="ticks">{ticks}</div><div class="ends"><span>פחות</span><span>יותר</span></div></div>
    <ul class="arows">{kit_acc_rows}</ul>
    <p class="use">סטייה: המרחק מהממוצע הופך הפרשים קטנים לנראים. סימון כפול: צבע, וקבוצה.</p></section>
  <section class="plate"><h2 class="ft">2022 מול היום: {find_changes}</h2>
    <div class="key"><span><i class="k-hollow"></i>2022</span><span><i class="k-dot"></i>היום</span><span><i class="k-bar"></i>טווח 80%</span></div>
    <div class="dax" aria-hidden="true"><div class="ticks">{dticks}</div></div>
    <ul class="arows" style="list-style:none;padding:0;margin:0">{"".join(db_row(f) for f in fams_sorted)}</ul>
    <p class="use">דמבל: שתי נקודות וקו ביניהן. מחליף טבלה רחבה שנחתכה בטלפון (גלישה ב"מה השתנה").</p></section>
  <section class="plate"><h2 class="ft">על הסף: עוברת רק בחלק מהתרחישים</h2>
    <ol class="rank">{"".join(rank_row(r, True) for r in edge)}</ol>
    <p class="use">עשר נקודות ממחישות את אחוז התרחישים שבהם הרשימה עוברת. האחוז עצמו כתוב לידן, בלי שינוי בחישוב.</p></section>
</main>
"""
(OUT / "chart-kit.html").write_text(page("בחירות 26: ערכת הגרפים", kit_body, KIT_EXTRA), encoding="utf-8")

# =====================================================================
# 4. שיטה, מקורות ואודות: מילון המספרים
# =====================================================================
SRC_MODEL = f"{D['polls']} סקרים, מנוע החוק (אחוז חסימה, הסכמי עודפים שדווחו, באדר-עופר) ו-20,000 תרחישים"
DICT = [
    ("current", "ממוצע הסקרים", "המצב היום · בית", "סיכום סקרים",
     "טבלאות הסקרים בוויקיפדיה האנגלית, עם קישור לפרסום המקורי של כל סקר",
     "כל מכון נספר פעם אחת (הסקר האחרון שלו). זה סיכום תיאורי של מה שפורסם — לא תחזית ולא מודל."),
    ("model", "טווח 80% ושיעור תרחישים", "בית · המצב והתרחישים", "תרחיש", SRC_MODEL,
     "שלוש שכבות אי-ודאות: כמה הממוצע של היום בטוח · כמה הוא עוד יזוז עד יום הבחירות · וטעות הסקרים המשותפת כפי שנמדדה בחמש המערכות הקודמות. כל תרחיש עובר במנוע החוק."),
    ("trends", "מגמות", "בית · סקרים ומגמות", "סיכום סקרים",
     "טבלאות הסקרים בוויקיפדיה האנגלית (עם קישור למקור של כל סקר)",
     "כל המכונים: חציון של הסקרים ב-14 הימים האחרונים, לפחות 3 סקרים לנקודה. ממוצע תיאורי — לא מודל ולא תחזית."),
    ("accuracy", "דיוק הסקרים בעבר", "בחירות קודמות", "סיכום סקרים",
     "טבלאות הסקרים בוויקיפדיה האנגלית לכל מערכת (עם קישור לפרסום המקורי), והתוצאות הרשמיות של ועדת הבחירות",
     "הפער = ההפרש בין חציון הסקרים לתוצאה, לכל רשימה. הטווח בגרף הוא הנמוך והגבוה בין הסקרים, לא טווח טעות סטטיסטי."),
    ("results", "תוצאות רשמיות", "בחירות קודמות", "נתון רשמי",
     "ועדת הבחירות המרכזית (votes25.bechirot.gov.il), ומנוע החוק של האתר",
     "כל המספרים מהתוצאות הרשמיות. 'מה הזיזו ההסכמים' — השוואה נגד-עובדתית על אותם קולות."),
    ("changes", "השוואה ל-2022", "מה השתנה מהבחירות האחרונות", "השוואה",
     "תוצאות האמת של בחירות 2022 (ועדת הבחירות המרכזית) מול הממוצע מבוסס-המודל",
     "שינוי נטו בין שתי תמונות. זה לא מעבר בוחרים — אי אפשר לדעת מכאן מי עבר לאן."),
    ("engine", "חוק הבחירות: אחוז חסימה וחלוקת מנדטים", "בכל מקום", "חישוב לפי החוק",
     "חוק הבחירות לכנסת, סעיפים 81–82; המנוע נבדק מול תוצאות 2019–2022",
     "האחוזים הם מתוך הקולות הכשרים. אחוז החסימה הוא 3.25%; רשימה מתחתיו לא מקבלת מנדטים."),
    ("crowd", "השערות גולשים", "הכנסת שלי · סקר האתר", "השערות גולשים, אינן סקר",
     "מה שמשתתפי האתר ניחשו ב\"הכנסת שלי\"",
     "זה אינו סקר: מי שמשתתף בוחר בזה בעצמו, אין דגימה ואין שקלול. הדשבורד מתאר את הגולשים באתר, לא את כלל הבוחרים."),
]


def entry(a, name, where, kind, source, assumption):
    return (f'<article class="entry" id="{a}"><h3>{name}</h3><p class="where">מופיע ב: {where}</p>'
            f'<dl><dt>סוג</dt><dd>{kind}</dd><dt>מקור</dt><dd>{source}</dd><dt>הנחה</dt><dd>{assumption}</dd></dl>'
            f'<a class="more" href="#">פירוט מלא</a></article>')


SOURCES = [
    "<b>תוצאות אמת (2019–2022):</b> עמודי התוצאות הארציות של ועדת הבחירות המרכזית; הקבצים שמורים בריפו עם חתימת sha256.",
    "<b>סקרים:</b> טבלאות הסקרים בוויקיפדיה האנגלית, כאינדקס. לכל סקר נשמר הקישור לפרסום המקורי; סקר שהושווה לפרסום המקורי מסומן \"אומת\".",
    "<b>הסכמי עודפים:</b> לכנסות 21–25 בוויקיפדיה העברית; לכנסת 26 כפי שדווחו בתקשורת.",
]
LAW = [
    "סקרים נקלטים אוטומטית מכל פרסום, בלי הקפאה ובלי הגבלת תאריך (הכרעת בעלים 9.10.2026, באישור משפטי), ומתעדכנים כל 4 שעות.",
    "האימות מול הפרסום המקורי הוא תווית שקיפות בלבד (\"אומת\" / \"לא אומת\"), ואינו תנאי לכניסת סקר.",
    "האתר אינו עורך סקרים, ואינו ממליץ על אף רשימה.",
]
ABOUT = [
    "האתר מנתח את הבחירות לכנסת ה-26 על בסיס נתונים פומביים. הוא אינו קשור לאף מפלגה, אינו עורך סקרים ואינו ממליץ על אף רשימה.",
    "הצבעים באתר ניטרליים במכוון ואינם צבעי המפלגות. \"מפלגות הממשלה היוצאת\" היא הגדרה עובדתית לפי הרכב הממשלה ה-37, לא תחזית לקואליציה.",
    "כל הקוד והנתונים פתוחים לעיון ב-github.com/hopetohelp/26. מצאתם טעות? אפשר לדווח שם, וכל תיקון נרשם בהיסטוריה.",
]
method_body = f"""
{top_bar()}
<main class="wrap" id="main">
  <h1 class="acc-h">שיטה, מקורות ואודות</h1>
  <nav class="utabs" aria-label="חלקי המסך"><a href="#" aria-current="page">מילון המספרים</a><a href="#">מקורות</a><a href="#">החוק</a><a href="#">אודות</a></nav>
  <p class="asof" style="margin-top:.75rem">כל גרף באתר מקשר לערך שלו כאן. התאריך המעודכן מופיע ליד הגרף.</p>
  <div class="dict">{"".join(entry(*e) for e in DICT)}</div>
  <h2 class="mh" id="sources">מקורות</h2><ul class="plain">{"".join(f"<li>{s}</li>" for s in SOURCES)}</ul>
  <h2 class="mh" id="law">החוק, סעיף 16ה</h2><ul class="plain">{"".join(f"<li>{s}</li>" for s in LAW)}</ul>
  <h2 class="mh" id="about">אודות</h2><ul class="plain">{"".join(f"<li>{s}</li>" for s in ABOUT)}</ul>
</main>
{tabs_bar("more")}
"""
(OUT / "method-proposal.html").write_text(page("בחירות 26: שיטה, מקורות ואודות", method_body, ACC_EXTRA), encoding="utf-8")

# =====================================================================
# 5. גיליון טוקנים ורכיבים
# =====================================================================
TOK_EXTRA = """
body { padding: 2rem; background: #fff; }
.sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 90rem; margin: 0 auto; }
.tile { background: rgb(var(--paper)); color: rgb(var(--ink)); font-family: var(--font-body), sans-serif; border: 1px solid rgb(var(--line)); border-radius: 16px; padding: 1.5rem; }
.tile h2 { margin: 0 0 1rem; font-size: 1.125rem; font-weight: 800; }
.tile h3 { margin: 1.4rem 0 .5rem; font-size: .875rem; font-weight: 800; color: rgb(var(--ink-soft)); }
.sws { display: grid; grid-template-columns: repeat(8, 1fr); gap: .4rem; }
.sws div { font-size: .75rem; color: rgb(var(--ink-soft)); text-align: center; direction: ltr; }
.sws b { display: block; height: 2.6rem; border-radius: 8px; border: 1px solid rgb(var(--line)); margin-bottom: .25rem; }
.spec { display: grid; grid-template-columns: 1fr 11rem; gap: .3rem 1rem; align-items: baseline; }
.spec small { color: rgb(var(--ink-soft)); font-size: .75rem; }
.chips { display: flex; flex-wrap: wrap; gap: .5rem; }
.chip { display: inline-flex; align-items: center; gap: .45rem; padding: .3rem .8rem; border-radius: 999px; border: 1.5px solid rgb(var(--ink) / .35); font-weight: 700; font-size: .875rem; }
.chip i { width: .8rem; height: .8rem; border-radius: 50%; border: 2px solid rgb(var(--ink)); box-sizing: border-box; }
.chip i.full { background: rgb(var(--ink)); }
.chip i.half { background: linear-gradient(to left, rgb(var(--ink)) 50%, transparent 50%); }
.seg { display: inline-flex; border: 1.5px solid rgb(var(--ink) / .35); border-radius: 999px; padding: 3px; gap: 2px; }
.seg span { padding: .35rem .9rem; border-radius: 999px; font-weight: 700; font-size: .875rem; }
.seg span.on { background: rgb(var(--signal)); color: rgb(var(--signal-ink)); }
.line { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; }
.note { font-size: .75rem; color: rgb(var(--ink-soft)); margin-top: .4rem; }
.tile .rank { margin-top: 0; }
.tile .btn.ghost { color: rgb(var(--ink)); }
.tile .entry { border: 0; padding: 0; }
.tile .asof { margin-top: 0; }
"""


def tile(theme, dark):
    tn = "מקצועי" if theme == "league" else "חדשותי"
    mn = "חשוך" if dark else "בהיר"
    attrs = f'data-theme="{theme}"' + (' data-dark=""' if dark else "")
    sw = "".join(f'<div><b style="background:rgb(var(--{t}))"></b>{t}</div>' for t in ("paper", "card", "line", "ink", "ink-soft", "accent", "signal", "band"))
    ex = safe[0]
    e0 = DICT[0]
    return f'''<section class="tile" {attrs}>
<h2>{tn} · {mn}</h2>
<h3>צבעים (טוקנים, בלי צבע קבוע ברכיב)</h3><div class="sws">{sw}</div>
<h3>כתב: שישה צעדים, גוף אחד לכל הטקסט והמספרים</h3>
<div class="spec">
 <div class="display" style="font-size:{'2.1rem' if theme == 'league' else '2.9rem'};line-height:1.06">52 מנדטים</div><small>כותרת ראשית בלבד (display)</small>
 <div style="font-size:1.5rem;font-weight:800">52</div><small>24 · 800 · מספרי מקרא</small>
 <div style="font-size:1.25rem;font-weight:800">כל הרשימות</div><small>20 · 800 · כותרת גרף, מספרים בשורות</small>
 <div style="font-size:1rem">מפלגות הממשלה היוצאת</div><small>16 · 400 · גוף</small>
 <div style="font-size:.875rem;color:rgb(var(--ink-soft))">נכון ל-7.10.2026</div><small>14 · משני</small>
 <div style="font-size:.75rem;color:rgb(var(--ink-soft))">0 &nbsp; 10 &nbsp; 20 &nbsp; 30</div><small>12 · צירים בלבד, לא מתחת</small>
</div>
<h3>מצב ברשימה: צורה וטקסט, לא רק צבע</h3>
<div class="chips"><span class="chip"><i class="full"></i>עוברת</span><span class="chip"><i class="half"></i>על הסף</span><span class="chip"><i></i>מתחת לסף</span></div>
<h3>פעולות ובחירת תצוגה (כפתור אחד בפס העליון פותח את שתי הבחירות)</h3>
<div class="line"><a class="btn" href="#">לבנות את הכנסת שלי</a><a class="btn ghost" href="#">שיטה, מקורות ואודות</a></div>
<div class="line" style="margin-top:.75rem"><span style="font-weight:700">עיצוב</span><span class="seg"><span class="on">מקצועי</span><span>חדשותי</span></span><span style="font-weight:700">תצוגה</span><span class="seg"><span>יום</span><span>לילה</span><span class="on">לפי המכשיר</span></span></div>
<h3>שורת רשימה</h3>
<ol class="rank"><li class="row"><span class="nm">{ex["name"]}</span><span class="n num">{ex["central"]}</span><span class="plot" aria-hidden="true"><span class="bar" style="left:{ex["lo"] / MAXV * 100:.2f}%;width:{(ex["hi"] - ex["lo"]) / MAXV * 100:.2f}%"></span><span class="dot" style="left:{ex["central"] / MAXV * 100:.2f}%"></span></span><span class="rng"></span></li></ol>
<h3>שקיפות: שורה אחת מתחת לגרף, וההסבר המלא במילון</h3>
<p class="asof">נכון ל-{asof} · {D["polls"]} סקרים · <a href="#">איך זה חושב?</a></p>
<div style="margin-top:.75rem">{entry(*e0)}</div>
<p class="note">רדיוס {'12px' if theme == 'league' else '10px'} · רווחים 4 · 8 · 12 · 16 · 24 · 32 · 48 · יעד נגיעה 44px לפחות · תנועה: רק מילוי המושבים בכניסה</p>
</section>'''


tok_body = '<div class="sheet">' + tile("league", False) + tile("board", False) + tile("league", True) + tile("board", True) + "</div>"
(OUT / "tokens-sheet.html").write_text(page("בחירות 26: טוקנים ורכיבים", tok_body, TOK_EXTRA, boot=False), encoding="utf-8")

json.dump({"acc": acc, "n_in": n_in, "n_all": n_all, "meretz_pct": thr, "dates": dates, "gov_n": gov_n,
           "series": [s for s in series], "families": [{"id": f["id"], "k26": f["k26"], "k25": f["k25"], "a": f["seats2022"], "b": f["seatsNow"], "range": f["seatsRange"]} for f in fams]},
          open(GEN / "acc-data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("home:", gov_n, glo, ghi, [r["name"] for r in edge], [r["name"] for r in below], (s_min, s_max))
print("accuracy:", n_in, n_all, round(thr, 3), "| changes:", find_changes)


# =====================================================================
# 5. גופנים, כרטיסים ומתגים רוחביים: היום מול מוצע
# =====================================================================
UI_EXTRA = """
body { background: rgb(var(--paper)); }
.uk { padding: 1.25rem 1rem 3rem; max-width: 90rem; margin: 0 auto; display: grid; gap: 3rem; }
.uk .note { color: rgb(var(--ink-soft)); font-size: .875rem; margin: .5rem 0 0; max-width: 60ch; }
.uk h2.sec { font-size: 1.5rem; font-weight: 800; margin: 0; line-height: 1.2; }
.cmp { display: grid; gap: 1.25rem; margin-top: 1rem; }
@media (min-width: 900px) { .cmp { grid-template-columns: 1fr 1fr; gap: 2rem; } }
.col { border-top: 3px solid rgb(var(--line)); padding-top: .75rem; min-width: 0; }
.col.new { border-top-color: rgb(var(--accent)); }
.tag { font-size: .875rem; font-weight: 800; margin: 0 0 1rem; color: rgb(var(--ink-soft)); }
.col.new .tag { color: rgb(var(--accent)); }
.spec { margin: 1rem 0 0; padding: 0; list-style: none; font-size: .875rem; color: rgb(var(--ink-soft)); display: grid; gap: .3rem; }
.spec li::before { content: "– "; }
/* --- טיפוגרפיה --- */
[data-theme="league"] .old { --font-display: "Secular One"; --font-body: "Assistant"; --font-num: "Secular One"; --display-weight: 400; --hero: 2.1rem; }
[data-theme="board"] .old { --font-display: "Karantina"; --font-body: "Heebo"; --font-num: "Karantina"; --display-weight: 400; --hero: 2.9rem; }
.ty { font-family: var(--font-body), system-ui, sans-serif; }
.ty .big { font-family: var(--font-display), var(--font-body), sans-serif; font-weight: var(--display-weight); font-size: var(--hero); line-height: 1.08; margin: 0; text-wrap: balance; }
.ty table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
.ty td { padding: .35rem 0; border-top: 1px solid rgb(var(--line)); font-size: 1rem; }
.ty td.n { text-align: end; font-weight: 700; font-size: 1.5rem; font-family: var(--font-num), var(--font-body), sans-serif; }
.ty .digs { font-family: var(--font-num), var(--font-body), sans-serif; font-size: 1.75rem; font-weight: 700; line-height: 1.3; direction: ltr; text-align: end; margin: 0; }
.ty .digs span { display: block; }
.ty.tn .digs, .ty.tn td.n { font-variant-numeric: tabular-nums; }
.ty .p16 { font-size: 1rem; line-height: 1.55; margin: .75rem 0 0; }
.ty .p12 { font-size: .75rem; color: rgb(var(--ink-soft)); margin: .4rem 0 0; }
/* --- כרטיסים --- */
.oc { border: 1px solid rgb(var(--line)); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.25rem; background: rgb(var(--card)); font-family: var(--font-body), sans-serif; }
.oc h3 { font-family: var(--font-display), var(--font-body), sans-serif; font-weight: var(--display-weight); font-size: 1.9rem; line-height: 1; margin: 0 0 .75rem; }
.oc .inner { border: 1px solid rgb(var(--line)); border-radius: var(--radius); padding: .75rem; background: rgb(var(--paper)); }
.oc .inner + .inner { margin-top: .5rem; }
.crow { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; font-size: 1rem; }
.crow b { font-family: var(--font-num), var(--font-body), sans-serif; font-variant-numeric: tabular-nums; }
.sf { border-top: 1px solid rgb(var(--line)); padding-top: 1rem; margin-top: 1.75rem; }
.sf:first-child { margin-top: 0; }
.sf h3, .cd h3 { font-size: 1.25rem; font-weight: 800; margin: 0 0 .25rem; line-height: 1.25; }
.sf .src, .cd .src { font-size: .875rem; color: rgb(var(--ink-soft)); margin: 0 0 .5rem; }
.cd { border: 1px solid rgb(var(--line)); border-radius: var(--radius); padding: 1rem; background: rgb(var(--card)); margin-top: 1.75rem; }
.pn { background: rgb(var(--band)); color: rgb(var(--band-ink)); border-radius: var(--radius); padding: 1.25rem; margin-top: 1.75rem; }
.pn h3 { margin: 0; font-size: 1.5rem; font-weight: 800; line-height: 1.2; }
.pn p { margin: .4rem 0 0; color: rgb(var(--band-soft)); font-size: .875rem; }
.fr { display: flex; align-items: center; justify-content: space-between; min-height: 3.5rem; border-top: 1px solid rgb(var(--line)); border-bottom: 1px solid rgb(var(--line)); margin-top: 1.75rem; font-weight: 700; }
.fr i { font-style: normal; font-size: 1.4rem; color: rgb(var(--ink-soft)); }
.lbl { display: inline-block; font-size: .75rem; font-weight: 700; color: rgb(var(--ink-soft)); margin-bottom: .25rem; }
/* --- מתגים: היום --- */
.rg { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .75rem; }
.pill { min-height: 2.75rem; padding: 0 1rem; border-radius: 999px; font: inherit; font-size: .875rem; font-weight: 700; border: 1px solid rgb(var(--line)); background: rgb(var(--card)); color: rgb(var(--ink)); display: inline-flex; align-items: center; }
.pill.f { border-color: rgb(var(--ink-faint)); background: transparent; }
.pill.t40 { min-height: 2.5rem; border-width: 2px; }
.pill.on { background: rgb(var(--ink)); color: rgb(var(--card)); border-color: rgb(var(--ink)); }
.pill.sg { background: rgb(var(--signal)); color: rgb(var(--signal-ink)); border-color: rgb(var(--signal)); }
/* --- מתגים: מוצע --- */
.tabsu { display: flex; border-bottom: 1px solid rgb(var(--line)); overflow-x: auto; scrollbar-width: none; margin-bottom: 1rem; }
.tabsu button { min-height: 2.75rem; display: inline-flex; align-items: center; padding: 0 1rem; font: inherit; font-size: 1rem; font-weight: 600; color: rgb(var(--ink-soft)); background: none; border: 0; border-bottom: 3px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tabsu button[aria-selected="true"] { color: rgb(var(--ink)); font-weight: 700; border-bottom-color: rgb(var(--accent)); }
.segd { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; padding: 3px; border-radius: var(--radius); background: rgb(var(--paper)); box-shadow: inset 0 0 0 1.5px rgb(var(--ink) / .35); margin-bottom: 1rem; }
.segd button { min-height: 2.75rem; border: 0; border-radius: calc(var(--radius) - 3px); background: transparent; font: inherit; font-size: .875rem; font-weight: 600; color: rgb(var(--ink-soft)); padding: 0 .4rem; }
.segd button[aria-checked="true"] { background: rgb(var(--card)); color: rgb(var(--ink)); font-weight: 700; box-shadow: inset 0 0 0 1.5px rgb(var(--ink)); }
.chips { display: flex; gap: .5rem; overflow-x: auto; scrollbar-width: none; padding: 2px 0; margin-bottom: 1rem; -webkit-mask-image: linear-gradient(to right, transparent 0, #000 2rem); mask-image: linear-gradient(to right, transparent 0, #000 2rem); }
.chips button { flex: none; min-height: 2.75rem; padding: 0 1rem; border-radius: 999px; border: 0; background: transparent; font: inherit; font-size: .875rem; font-weight: 600; color: rgb(var(--ink)); box-shadow: inset 0 0 0 1.5px rgb(var(--ink) / .35); }
.chips button[aria-checked="true"] { background: rgb(var(--ink)); color: rgb(var(--card)); box-shadow: none; font-weight: 700; }
.swt { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 2.75rem; width: 100%; background: none; border: 0; padding: 0; font: inherit; font-size: 1rem; font-weight: 600; color: rgb(var(--ink)); margin-bottom: 1rem; }
.swt .tr { flex: none; width: 2.9rem; height: 1.7rem; border-radius: 999px; background: rgb(var(--ink) / .35); position: relative; }
.swt .tr::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: calc(1.7rem - 6px); height: calc(1.7rem - 6px); border-radius: 50%; background: rgb(var(--card)); }
.swt[aria-checked="true"] .tr { background: rgb(var(--accent)); }
.swt[aria-checked="true"] .tr::after { inset-inline-start: calc(100% - 1.7rem + 3px); }
.swt small { display: block; font-weight: 400; font-size: .875rem; color: rgb(var(--ink-soft)); }
.sheetx { border: 1px solid rgb(var(--line)); border-radius: var(--radius); background: rgb(var(--card)); padding: .5rem 1rem 1rem; }
.sheetx h3 { margin: 0; font-size: 1.25rem; font-weight: 800; min-height: 3rem; display: flex; align-items: center; }
.focus { outline: 3px solid rgb(var(--accent)); outline-offset: 2px; }
"""

OLD_BIT = '<span class="lbl">מקצועי: ספרות לא שוות רוחב</span>'
ty_rows = [("סקרים בארכיון", "775"), ("סקרים בממוצע", str(D["polls"])), ("מכונים", "10"), ("מושבים בכנסת", "120")]


def ty_col(old):
    cls = "ty old" if old else "ty tn"
    tag = "היום" if old else "מוצע"
    rows_html = "".join(f'<tr><td>{a}</td><td class="n">{b}</td></tr>' for a, b in ty_rows)
    return (f'<div class="col{"" if old else " new"}"><p class="tag">{tag}</p><div class="{cls}">'
            f'<h3 class="big">מפלגות הממשלה היוצאת: {gov_n} מנדטים. לרוב דרושים 61.</h3>'
            f'<table aria-label="דוגמת מספרים בטור">{rows_html}</table>'
            '<p class="digs" dir="ltr"><span>1111</span><span>8888</span><span>1,234</span></p>'
            '<p class="p16">כמה תקבל כל רשימה? מחלקים 120 מושבים, ומשווים למה שמנחשים כל השאר. השערות גולשים, אינן סקר.</p>'
            f'<p class="p12">0 · 10 · 20 · 30 · נכון ל-{asof} · {D["polls"]} סקרים · איך זה חושב?</p></div></div>')


def card_rows():
    return "".join(f'<div class="crow"><span>{r["name"]}</span><b>{r["central"]}</b></div>' for r in rows[:3])


old_card = (f'<div class="col"><p class="tag">היום</p><div class="old"><div class="oc"><h3>הגושים שלי</h3>'
            f'<div class="inner">{card_rows()}</div><div class="inner" style="font-size:.875rem">מקור: ממוצע המודל · נכון ל-{asof} · הנחה: הקבוצה לפי ממשלה 37 · איך זה חושב?</div></div>'
            '<div class="oc" style="margin-bottom:0"><h3>פירוט לפי מכון</h3><div class="inner" style="font-size:.875rem">כרטיס בתוך כרטיס, כותרת בגודל 30px בגופן הכותרות</div></div></div>'
            '<ul class="spec"><li>כל קבוצה בקופסה עם מסגרת, וקופסה בתוך קופסה</li><li>כותרת כרטיס: 30px בגופן הכותרות, בכל כרטיס</li></ul></div>')
new_card = (f'<div class="col new"><p class="tag">מוצע</p>'
            f'<section class="sf"><h3>הגושים שלי</h3><p class="src">נכון ל-{asof} · <a href="#">איך זה חושב?</a></p>{card_rows()}</section>'
            f'<section class="cd"><h3>כרטיס: יחידה שאפשר לשתף</h3><p class="src">מסגרת אחת, בלי קופסה בתוכה</p>{card_rows()}</section>'
            '<aside class="pn"><h3>כמה תקבל כל רשימה? תנחשו.</h3><p>פאנל פעולה: אחד בכל מסך</p></aside>'
            '<div class="fr"><span>פירוט לפי מכון</span><i aria-hidden="true">+</i></div>'
            '<ul class="spec"><li>שלוש רמות: משטח (קו דק), כרטיס (מסגרת), פאנל (כהה)</li><li>כותרת: 20px, משקל 800, בלי גופן הכותרות</li><li>אין קופסה בתוך קופסה</li></ul></div>')


def pills(items, cls=""):
    return "".join(f'<span class="pill {cls} {"on" if i == 0 else ""}">{t}</span>' for i, t in enumerate(items))


old_tog = ('<div class="col"><p class="tag">היום</p>'
           '<span class="lbl">לשוניות מסך (Tabbed): כפתורים עגולים</span><div class="rg">' + pills(["היום", "תחזית ותרחישים"]) + '</div>'
           '<span class="lbl">מערכת בחירות: חמש אפשרויות, יורדות לשורה שנייה</span><div class="rg">' + pills(["2022", "2021", "2020", "2019 ב׳", "2019 א׳"], "f") + '</div>'
           '<span class="lbl">השוואה לפי: מסגרת כהה יותר ללא נבחר</span><div class="rg">' + pills(["לפי הגושים שלי", "לפי המפלגה", "לפי המחנה"], "f") + '</div>'
           '<span class="lbl">דשבורד: גובה 40 ומסגרת כפולה</span><div class="rg">' + pills(["מנדטים", "אחוזים"], "t40") + '</div>'
           '<span class="lbl">בורר עיצוב: מילוי בצבע ההדגשה</span><div class="rg"><span class="pill sg">● מקצועי</span><span class="pill f">● חדשותי</span></div>'
           '<ul class="spec"><li>שבעה מימושים נפרדים, בשלושה גבהים ושני עוביי מסגרת</li><li>מסגרת הלא-נבחר בלשוניות: ניגודיות 1.4:1</li><li>חמש אפשרויות יורדות לשתי שורות</li></ul></div>')
new_tog = ('<div class="col new"><p class="tag">מוצע</p>'
           '<span class="lbl">לשוניות (Tabs): מעבר בין מסכים, מתחת לסרגל</span>'
           '<div class="tabsu" role="tablist" aria-label="המצב והתרחישים"><button role="tab" aria-selected="true">היום</button><button role="tab" aria-selected="false">תחזית ותרחישים</button></div>'
           '<span class="lbl">מתג מקטעים (Segmented): שניים עד ארבעה, שורה אחת</span>'
           '<div class="segd" role="radiogroup" aria-label="השוואה לפי"><button role="radio" aria-checked="true">לפי הגושים שלי</button><button role="radio" aria-checked="false">לפי המפלגה</button><button role="radio" aria-checked="false">לפי המחנה</button></div>'
           '<span class="lbl">צ׳יפים (Chips): חמש אפשרויות ומעלה, גלילה בשורה אחת</span>'
           '<div class="chips" role="radiogroup" aria-label="מערכת בחירות"><button role="radio" aria-checked="true">2022</button><button role="radio" aria-checked="false">2021</button><button role="radio" aria-checked="false">2020</button><button role="radio" aria-checked="false">2019 ב׳</button><button role="radio" aria-checked="false">2019 א׳</button></div>'
           '<span class="lbl">מתג הדלקה (Switch): הפעלה וכיבוי</span>'
           '<button class="swt" role="switch" aria-checked="true"><span>הצגה כטבלה<small>הנתונים מאחורי הגרף</small></span><span class="tr"></span></button>'
           '<span class="lbl">חלון "תצוגה": מתגי מקטעים במקום ארבעה בקרים</span>'
           '<div class="sheetx"><h3>תצוגה</h3><span class="lbl">עיצוב</span><div class="segd" role="radiogroup" aria-label="עיצוב"><button role="radio" aria-checked="true">מקצועי</button><button role="radio" aria-checked="false">חדשותי</button></div>'
           '<span class="lbl">מצב</span><div class="segd" role="radiogroup" aria-label="מצב" style="margin-bottom:0"><button role="radio" aria-checked="true">יום</button><button role="radio" aria-checked="false">לילה</button><button role="radio" aria-checked="false">לפי המכשיר</button></div></div>'
           '<ul class="spec"><li>ארבעה רכיבים לארבעה תפקידים, כולם בגובה 44px</li><li>הנבחר מסומן במסגרת כהה וקו תחתון (ניגודיות מעל 3:1), לא בצבע בלבד</li><li>חצים במקלדת עוברים בין האפשרויות (radiogroup, tablist)</li></ul></div>')

ui_body = f"""
{top_bar(count="גופנים, כרטיסים ומתגים", nav=False)}
<main class="uk" id="main">
  <header><h1 class="acc-h">גופנים, כרטיסים ומתגים</h1><p class="note">היום מול מוצע, בעיצוב שנבחר בראש הדף. כל הדוגמאות בנתוני האתר; לא שונה שום חישוב.</p></header>
  <section aria-labelledby="s-ty"><h2 class="sec" id="s-ty">גופנים: משפחה אחת לכל עיצוב, וספרות שוות רוחב</h2>
    <div class="cmp">{ty_col(True)}{ty_col(False)}</div>
    <ul class="spec"><li>מקצועי: IBM Plex Sans Hebrew לכול. חדשותי: Frank Ruhl Libre לכותרות ו-Heebo לגוף.</li><li>בשני העיצובים ספרות שוות רוחב אמיתיות (tabular). ב"היום" Assistant ו-Secular One ו-Karantina אינם מציעים אותן.</li></ul></section>
  <section aria-labelledby="s-cd"><h2 class="sec" id="s-cd">כרטיסים: שלוש רמות במקום קופסאות בתוך קופסאות</h2>
    <div class="cmp">{old_card}{new_card}</div></section>
  <section aria-labelledby="s-tg"><h2 class="sec" id="s-tg">מתגים רוחביים: ארבעה רכיבים במקום שבעה מימושים</h2>
    <div class="cmp">{old_tog}{new_tog}</div></section>
</main>
{tabs_bar("more")}
"""
(OUT / "ui-kit.html").write_text(page("בחירות 26: גופנים, כרטיסים ומתגים", ui_body, ACC_EXTRA.split("@media")[0] + UI_EXTRA, extra_head=FONTS_OLD), encoding="utf-8")
