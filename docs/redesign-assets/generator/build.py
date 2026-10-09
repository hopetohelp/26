#!/usr/bin/env python3
"""מחולל הדגמות העיצוב מחדש (docs/עיצוב-מחדש-מחקר-והצעה.md). אינו חלק מהאתר ואינו רץ ב-CI.
הרצה מחדש: npx vite-node docs/redesign-assets/generator/extract.ts > docs/redesign-assets/generator/home-data.json
            python3 docs/redesign-assets/generator/build.py
כל המספרים מגיעים מנתוני האתר עצמו:
 - מסך הבית: model.json דרך הפונקציות של האתר (extract.ts → home-data.json) ושינוי 7 ימים מ-trend
 - גרף הסקרים מול התוצאות: history.json (בחירות 2022) ו-results.json
הפלט: קבצי HTML עצמאיים ב-docs/redesign-assets (ה-CSS המשותף מוטמע)."""
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
         '<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Heebo:wght@400;500;600;700;800&family=Karantina:wght@400;700&family=Secular+One&display=swap" rel="stylesheet">')
BOOT = """<script>(function(){var q=new URLSearchParams(location.search),d=document.documentElement;
d.dataset.theme=q.get('theme')==='board'?'board':'league';var m=q.get('mode');
if(m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))d.dataset.dark='';
if(q.get('freeze'))d.dataset.freeze='';if(q.get('card'))d.dataset.card='';if(q.get('static'))d.dataset.static='';})();</script>"""


def page(title, body, extra_css="", boot=True):
    return f"""<!doctype html>
<html lang="he" dir="rtl" data-theme="league">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>{FONTS}
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
    "sliders": '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    "chev": '<path d="M15 6l-6 6 6 6"/>',
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
# 1. מסך הבית המוצע
# =====================================================================
rows = D["rows"]
gov_n = sum(r["central"] for r in rows if r["gov"])
glo, gmid, ghi = D["bloc"]["seats"]
assert gov_n == gmid, (gov_n, gmid)
oth_n = 120 - gov_n
edge = [r for r in rows if (not r["sure"]) and 0.005 < r["pass"] < 0.995]
below = [r for r in rows if r["pass"] <= 0.005]
at61 = round(D["bloc"]["atLeast61"] * 100)
asof = fmt_date(D["asOf"])

# שינוי ב-7 הימים האחרונים לפי trend של המודל
t7 = date.fromisoformat(MODEL["asof"]) - timedelta(days=7)
prev = [t for t in MODEL["trend"] if date.fromisoformat(t["date"]) <= t7][-1]
for r in rows:
    r["d7"] = r["central"] - prev["seats"].get(r["id"], 0)
moves = [r for r in rows if r["d7"] != 0]

hemi_groups = [("seat-a", gov_n, f"{gov_n} למפלגות הממשלה היוצאת"), ("seat-b", oth_n, f"{oth_n} לשאר הרשימות")]


def dots(p):
    k = round(p * 10)
    return '<span class="dots" aria-hidden="true">' + "<i></i>" * k + '<i class="off"></i>' * (10 - k) + "</span>", k


def edge_li(r):
    d, k = dots(r["pass"])
    return (f'<li><span class="nm">{r["name"]}</span><span class="seats num" aria-label="{r["central"]} מנדטים לפי הממוצע">{r["central"]}</span>'
            f'<span class="how">{d}<span>עוברת ב-{k} מתוך 10 תרחישים</span></span></li>')


MAXV = 30


def rank_row(r):
    lo, hi, c = r["lo"], r["hi"], r["central"]
    flag = "<em>על הסף</em>" if r in edge else ""
    width = max((hi - lo) / MAXV * 100, 0.8)
    return (f'<li class="row"><span class="nm">{r["name"]}{flag}</span><span class="n num">{c}</span>'
            f'<span class="plot" aria-hidden="true"><span class="bar" style="left:{lo / MAXV * 100:.2f}%;width:{width:.2f}%"></span>'
            f'<span class="dot" style="left:{c / MAXV * 100:.2f}%"></span></span>'
            f'<span class="rng">{L(f"{lo}–{hi}")}</span><span class="sr">; טווח {lo} עד {hi}</span></li>')


def signed(d):
    return f'{"+" if d > 0 else "−"}{abs(d)}'


moves_txt = (" · ".join(f'{r["name"]} {L(signed(r["d7"]))}' for r in moves) + ". שאר הרשימות ללא שינוי.") if moves else "אין שינוי במנדטים."
ticks_home = "".join(f'<span style="left:{v / MAXV * 100:.2f}%">{v}</span>' for v in (0, 10, 20, 30))

INDEX = [
    ("המצב והתרחישים", "כמה מנדטים לכל רשימה היום, התרחישים ליום הבחירות, והתחזית."),
    ("סקרים ומגמות", "כל סקר שפורסם עם המקור, ואיך כל רשימה עלתה או ירדה."),
    ("סקר האתר", "השערות המשתתפים: ממוצע, טווח והשוואה לסקרים ולהשערה שלכם."),
    ("בחירות קודמות", f"התוצאות הרשמיות {L('2019–2022')}, כמה הסקרים טעו, ושיעורי ההצבעה."),
    ("מה השתנה מהבחירות האחרונות", "כל משפחת מפלגות: הקולות ב-2022 מול הממוצע של היום."),
    ("שיטה, מקורות ואודות", "איך כל מספר מחושב, מאיפה הנתונים, ומי אנחנו."),
]
NAV = [("בית", True), ("הכנסת שלי", False), ("סקר האתר", False), ("המצב והתרחישים", False), ("סקרים ומגמות", False),
       ("בחירות קודמות", False), ("מה השתנה", False), ("שיטה ומקורות", False), ("תמיכה", False)]
TABS = [("בית", "home", True), ("מצב ותחזית", "board", False), ("סקר האתר", "bars", False), ("הכנסת שלי", "guess", False), ("תמיכה", "comments", False)]
FREEZE = ("הסקרים באתר אינם עדכניים ואין ללמוד מהם על דפוסי הצבעה או עמדות הציבור היום. לפי חוק, מתום יום שישי שלפני הבחירות "
          "ועד סגירת הקלפיות לא מתפרסמים סקרים חדשים; כל הסקרים כאן פורסמו לראשונה לפני כן.")

HOME_EXTRA = """
@media (min-width: 1024px) {
  .hero { grid-template-areas: "head hemi" "facts hemi"; }
  .hero-head { grid-area: head; align-self: end; }
  .hemi { grid-area: hemi; align-self: center; }
  .hero-facts { grid-area: facts; align-self: start; }
}
"""

home_body = f"""
<header class="top"><div class="top-in">
  <a class="brand" href="#">בחירות 26</a>
  <nav class="navd" aria-label="ניווט ראשי"><ul>{''.join(f'<li><a href="#"{" aria-current=page" if cur else ""}>{n}</a></li>' for n, cur in NAV)}</ul></nav>
  <span class="spacer"></span>
  <span class="count">עוד <b class="num">18</b> ימים</span>
  <button class="icon-btn" type="button" aria-label="תצוגה: עיצוב ויום או לילה">{svg("sliders")}</button>
</div></header>
<div class="freeze" role="alert"><p>{FREEZE}</p></div>
<main id="main">
  <section class="hero" aria-labelledby="h1">
    <div class="hero-head">
      <h1 class="h1" id="h1">מפלגות הממשלה היוצאת: {gov_n} מנדטים. לרוב דרושים 61.</h1>
      <p class="lede">ב-80% מהתרחישים: בין {glo} ל-{ghi} מנדטים. ב-{at61}% מהם: 61 ומעלה.</p>
    </div>
    <figure class="hemi" style="margin-inline:0">{hemicycle(hemi_groups)}</figure>
    <div class="hero-facts">
      <ul class="legend">
        <li><span class="sw a"></span><span class="lbl">מפלגות הממשלה היוצאת</span><span class="val"><span class="big num">{gov_n}</span><small>טווח {L(f"{glo}–{ghi}")}</small></span></li>
        <li><span class="sw b"></span><span class="lbl">כל שאר הרשימות</span><span class="val"><span class="big num">{oth_n}</span><small>טווח {L(f"{120 - ghi}–{120 - glo}")}</small></span></li>
      </ul>
      <p class="src">ממוצע {D["polls"]} סקרים של {D["pollsters"]} מכונים, עד {asof}. <a href="#">איך זה חושב?</a></p>
    </div>
  </section>

  <div class="body">
    <section class="sec edge-sec" aria-labelledby="h-edge">
      <h2 class="h2" id="h-edge">על הסף: {"שתי רשימות" if len(edge) == 2 else f"{len(edge)} רשימות"}</h2>
      <p class="sec-lead">אחוז החסימה הוא 3.25% מהקולות הכשרים. רשימה מתחתיו לא מקבלת מנדטים.</p>
      <ul class="edge">{''.join(edge_li(r) for r in edge)}</ul>
      <p class="src">המספר בכל שורה: מנדטים לפי הממוצע. הנקודות: בכמה מתוך 10 תרחישים הרשימה עוברת את הסף.
        כמעט באף תרחיש לא עוברות: {", ".join(r["name"] for r in below)}.</p>
    </section>

    <section class="sec rank-sec" aria-labelledby="h-rank">
      <h2 class="h2" id="h-rank">כל הרשימות</h2>
      <div class="key"><span><i class="k-dot"></i>ממוצע הסקרים</span><span><i class="k-bar"></i>טווח 80% מהתרחישים</span></div>
      <div class="axisrow" aria-hidden="true"><div class="ticks">{ticks_home}</div></div>
      <ol class="rank">{''.join(rank_row(r) for r in rows if r["central"] > 0)}</ol>
      <p class="src">ב-7 הימים האחרונים: {moves_txt} <a href="#">לכל הרשימות והתרחישים</a></p>
    </section>

    <aside class="cta" aria-labelledby="h-cta">
      <h2 id="h-cta">כמה תקבל כל רשימה? תנחשו.</h2>
      <p>מחלקים 120 מושבים ומשווים למה שמנחשים כל השאר. השערות גולשים, אינן סקר.</p>
      <a class="btn" href="#">לבנות את הכנסת שלי</a>
    </aside>

    <section class="sec idx-sec" aria-labelledby="h-idx">
      <h2 class="h2" id="h-idx">להמשך</h2>
      <ul class="index">{''.join(f'<li><a href="#"><span><b>{t}</b><span class="d">{d}</span></span>{svg("chev")}</a></li>' for t, d in INDEX)}</ul>
    </section>
  </div>

  <footer class="foot">
    <p>האתר אינו עורך סקרים ואינו ממליץ על אף רשימה. כל מספר נבנה מסקרים שפורסמו, עם קישור לפרסום המקורי.</p>
    <p><a href="#">שיטה ומקורות</a></p>
  </footer>
</main>
<nav class="tabs" aria-label="ניווט בטלפון"><ul>{''.join(f'<li><a href="#"{" aria-current=page" if cur else ""}>{svg(ic)}{n}</a></li>' for n, ic, cur in TABS)}</ul></nav>
"""
(OUT / "home-proposal.html").write_text(page("בחירות 26: מסך בית מוצע", home_body, HOME_EXTRA), encoding="utf-8")

# =====================================================================
# 2. הסקרים מול התוצאות (בחירות 2022), מחדש: גרף סטייה
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
LET = [("מחל", "הליכוד"), ("פה", "יש עתיד"), ("ט", "הציונות הדתית ועוצמה יהודית"), ("כן", "המחנה הממלכתי"), ("שס", 'ש"ס'), ("ג", "יהדות התורה"),
       ("ל", "ישראל ביתנו"), ("עם", 'רע"ם'), ("ום", 'חד"ש-תע"ל'), ("אמת", "העבודה"), ("מרצ", "מרצ")]
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
    if x["let"] == "מרצ":
        note = f'לא עברה את אחוז החסימה: {thr:.2f}% מהקולות הכשרים'
    elif out:
        note = f'{abs(x["miss"])} מנדטים יותר מהגבוה בסקרים'
    else:
        note = ""
    lo, hi = x["lo"] - x["mean"], x["hi"] - x["mean"]
    rng = f'{x["lo"]}' if x["lo"] == x["hi"] else f'{x["lo"]}–{x["hi"]}'
    grid = "".join(f'<i class="g{" z" if v == 0 else ""}" style="left:{pos(v):.2f}%"></i>' for v in (-4, -2, 0, 2, 4))
    return (f'<li class="arow{" out" if out else ""}"><span class="nm">{x["name"]}</span>'
            f'<span class="dplot" aria-hidden="true">{grid}<span class="bar" style="left:{pos(lo):.2f}%;width:{max((hi - lo) / span * 100, 1.2):.2f}%"></span>'
            f'<span class="dot{" sig" if out else ""}" style="left:{pos(x["actual"] - x["mean"]):.2f}%"></span></span>'
            f'<span class="av"><b class="num">{x["actual"]}</b><small>סקרים {L(rng)}</small></span>'
            + (f'<span class="note">{note}</span>' if note else "") + "</li>")


def table():
    head = "".join(f"<th>{c[0]}</th>" for c in CH)
    body = "".join(f'<tr><th scope="row">{x["name"]}</th>' + "".join(f'<td class="num">{v}</td>' for v in x["vals"]) + f'<td class="num"><b>{x["actual"]}</b></td></tr>'
                   for x in sorted(acc, key=lambda x: -x["actual"]))
    return f'<table class="tbl"><thead><tr><th>רשימה</th>{head}<th>תוצאה</th></tr></thead><tbody>{body}</tbody></table>'


ACC_EXTRA = """
.wrap { padding: 1.25rem 1rem 2.5rem; max-width: 64rem; margin: 0 auto; }
html[data-card] .wrap { padding: 2.2rem 2.4rem 2rem; max-width: none; }
.acc-h { font-family: var(--font-display), var(--font-body), sans-serif; font-weight: 400; font-size: var(--hero); line-height: 1.06; margin: 0; text-wrap: balance; }
.lede { margin-top: .75rem; }
.grp { margin: 1.5rem 0 .25rem; font-size: 1rem; font-weight: 800; }
.arows { list-style: none; margin: 0; padding: 0; }
.arow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; grid-template-areas: "nm plot av" "note note note"; align-items: center; gap: .1rem .75rem; padding: .55rem 0; border-top: 1px solid rgb(var(--line)); }
.arow:last-child { border-bottom: 1px solid rgb(var(--line)); }
.arow .nm { grid-area: nm; font-weight: 600; line-height: 1.25; }
.dplot { grid-area: plot; position: relative; height: 1.5rem; direction: ltr; }
.dplot i.g { position: absolute; top: 0; bottom: 0; width: 1px; background: rgb(var(--line)); }
.dplot i.z { background: rgb(var(--ink-faint)); width: 1.5px; }
.dplot .bar { position: absolute; top: 50%; height: .35rem; margin-top: -.175rem; border-radius: 99px; background: rgb(var(--accent) / .7); }
.dplot .dot { position: absolute; top: 50%; width: .95rem; height: .95rem; margin: -.475rem 0 0 -.475rem; border-radius: 50%; background: rgb(var(--ink)); box-shadow: 0 0 0 2px rgb(var(--paper)); }
.dplot .dot.sig { background: rgb(var(--signal)); box-shadow: 0 0 0 2px rgb(var(--paper)), 0 0 0 3.5px rgb(var(--ink)); }
.arow .av { grid-area: av; text-align: end; line-height: 1.1; }
.arow .av b { font-size: 1.25rem; font-weight: 800; display: block; }
.arow .av small { font-size: .75rem; color: rgb(var(--ink-soft)); white-space: nowrap; }
.arow .note { grid-area: note; font-size: .875rem; color: rgb(var(--ink)); font-weight: 700; padding-top: .1rem; }
.arow.out .nm { font-weight: 800; }
.axis { display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, 46%) 4.6rem; gap: .1rem .75rem; font-size: .75rem; color: rgb(var(--ink-soft)); margin-top: .5rem; }
.axis .ticks { grid-column: 2; position: relative; height: 1rem; direction: ltr; }
.axis .ticks span { position: absolute; transform: translateX(-50%); }
.axis .ends { grid-column: 2; display: flex; justify-content: space-between; direction: ltr; font-weight: 700; }
.k-dot.sig { background: rgb(var(--signal)); box-shadow: 0 0 0 2px rgb(var(--paper)), 0 0 0 3.5px rgb(var(--ink)); }
.depth { margin-top: 1.5rem; border-top: 1px solid rgb(var(--line)); }
.depth summary { cursor: pointer; padding: .9rem 0; font-weight: 700; min-height: 3rem; list-style: none; display: flex; justify-content: space-between; }
.depth summary::-webkit-details-marker { display: none; }
.depth summary::after { content: "+"; font-size: 1.4rem; line-height: 1; color: rgb(var(--ink-soft)); }
.depth[open] summary::after { content: "−"; }
.tbl { width: 100%; border-collapse: collapse; font-size: .875rem; }
.tbl th, .tbl td { padding: .45rem .3rem; border-top: 1px solid rgb(var(--line)); text-align: center; }
.tbl th:first-child { text-align: start; font-weight: 600; }
.tbl thead th { font-size: .75rem; color: rgb(var(--ink-soft)); font-weight: 600; }
.cardfoot { display: none; }
html[data-card] .cardfoot { display: flex; justify-content: space-between; margin-top: 1.4rem; padding-top: .9rem; border-top: 1px solid rgb(var(--line)); font-size: .75rem; color: rgb(var(--ink-soft)); }
html[data-card] .top, html[data-card] .depth { display: none; }
html[data-card] .acc-h { font-size: 2.3rem; }
@media (min-width: 1024px) { html:not([data-card]) .arow { grid-template-columns: 13rem minmax(0, 1fr) 6rem 15rem; grid-template-areas: "nm plot av note"; } html:not([data-card]) .axis { grid-template-columns: 13rem minmax(0, 1fr) 6rem 15rem; } .arow .note { font-weight: 600; font-size: .875rem; } }
"""
ticks = "".join(f'<span style="left:{pos(v):.2f}%">{("+" if v > 0 else "−" if v < 0 else "")}{abs(v)}</span>' for v in (-4, -2, 0, 2, 4))
acc_body = f"""
<header class="top"><div class="top-in"><a class="brand" href="#">בחירות 26</a><span class="spacer"></span><span class="count">בחירות קודמות: 2022</span></div></header>
<main class="wrap" id="main">
  <h1 class="acc-h">ב-{len(out_rows)} מתוך {n_all} רשימות התוצאה יצאה מחוץ לטווח הסקרים</h1>
  <p class="lede">ב-{n_in} רשימות התוצאה הייתה בתוך הטווח של ארבעת הסקרים האחרונים. ש"ס, רע"ם וחד"ש-תע"ל קיבלו יותר מהטווח, ומרצ לא עברה את אחוז החסימה.</p>

  <div class="key" style="margin-top:1.25rem"><span><i class="k-bar"></i>הטווח של ארבעת הסקרים האחרונים</span><span><i class="k-dot"></i>תוצאה רשמית בתוך הטווח</span><span><i class="k-dot sig"></i>תוצאה רשמית מחוץ לטווח</span></div>
  <p class="src" style="margin-top:.25rem">הציר: כמה מנדטים יותר (+) או פחות (−) מממוצע ארבעת הסקרים.</p>
  <div class="axis" aria-hidden="true"><div class="ticks">{ticks}</div><div class="ends"><span>פחות</span><span>יותר</span></div></div>

  <h2 class="grp">מחוץ לטווח הסקרים</h2>
  <ul class="arows">{''.join(acc_row(x) for x in out_rows)}</ul>
  <h2 class="grp">בתוך הטווח</h2>
  <ul class="arows">{''.join(acc_row(x) for x in in_rows)}</ul>

  <details class="depth"><summary>הצגה כטבלה: כל ארבעת הסקרים</summary>{table()}</details>
  <p class="src" style="margin-top:1rem">הסקר האחרון של כל אחד מארבעת ערוצי הטלוויזיה: כאן 11 (קנטר, {fmt_date(dates["כאן 11"])}), חדשות 12 (מדגם, {fmt_date(dates["חדשות 12"])}),
  חדשות 13 (קמיל פוקס, {fmt_date(dates["חדשות 13"])}), ערוץ 14 (דיירקט פולס, {fmt_date(dates["ערוץ 14"])}). תוצאות: ועדת הבחירות המרכזית. הפס מראה את הנמוך והגבוה בארבעת הסקרים, לא טווח טעות סטטיסטי.</p>
  <div class="cardfoot"><span>בחירות 26 · בחירות לכנסת ה-25</span><span>הסקרים מול התוצאות</span></div>
</main>
<script>if(location.search.indexOf('table=1')>-1){{var d=document.querySelector('.depth');if(d)d.setAttribute('open','');}}</script>
"""
(OUT / "accuracy-proposal.html").write_text(page("בחירות 26: הסקרים מול התוצאות", acc_body, ACC_EXTRA), encoding="utf-8")

# =====================================================================
# 3. גיליון טוקנים ורכיבים (style tile)
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
.sheet-demo { background: rgb(var(--card)); border: 1px solid rgb(var(--line)); border-radius: var(--radius); padding: 1rem; font-size: .875rem; }
.sheet-demo dl { margin: .5rem 0 0; display: grid; grid-template-columns: 6rem 1fr; gap: .3rem 1rem; }
.sheet-demo dt { color: rgb(var(--ink-soft)); }
.sheet-demo dd { margin: 0; }
.note { font-size: .75rem; color: rgb(var(--ink-soft)); margin-top: .4rem; }
.tile .rank { margin-top: 0; }
.tile .freeze { display: block; border-radius: 8px; border: 1px solid rgb(var(--warn)); }
.tile .btn.ghost { color: rgb(var(--ink)); }
"""


def tile(theme, dark):
    tn = "מקצועי" if theme == "league" else "חדשותי"
    mn = "חשוך" if dark else "בהיר"
    attrs = f'data-theme="{theme}"' + (' data-dark=""' if dark else "")
    sw = "".join(f'<div><b style="background:rgb(var(--{t}))"></b>{t}</div>' for t in ("paper", "card", "line", "ink", "ink-soft", "accent", "signal", "band"))
    ex = rows[0]
    return f'''<section class="tile" {attrs}>
<h2>{tn} · {mn}</h2>
<h3>צבעים (טוקנים, בלי צבע קבוע ברכיב)</h3><div class="sws">{sw}</div>
<h3>כתב: שישה צעדים, גוף אחד לכל הטקסט והמספרים</h3>
<div class="spec">
 <div class="display" style="font-size:{'2.1rem' if theme == 'league' else '2.9rem'};line-height:1.06">52 מנדטים</div><small>כותרת ראשית בלבד (display)</small>
 <div style="font-size:1.25rem;font-weight:800">על הסף: שתי רשימות</div><small>20 · 800 · כותרת קבוצה</small>
 <div style="font-size:1rem">מפלגות הממשלה היוצאת</div><small>16 · 400 · גוף</small>
 <div style="font-size:.875rem;color:rgb(var(--ink-soft))">ממוצע 37 סקרים, עד 7.10.2026</div><small>14 · משני ומקורות</small>
 <div class="num" style="font-size:1.25rem;font-weight:800">22 &nbsp; <span class="ltr">18–27</span></div><small>20 · 800 · מספרים (ספרות שוות רוחב)</small>
 <div style="font-size:.75rem;color:rgb(var(--ink-soft))">0 &nbsp; 10 &nbsp; 20 &nbsp; 30</div><small>12 · צירים בלבד, לא מתחת</small>
</div>
<h3>מצב ברשימה: צורה וטקסט, לא רק צבע</h3>
<div class="chips"><span class="chip"><i class="full"></i>עוברת</span><span class="chip"><i class="half"></i>על הסף</span><span class="chip"><i></i>מתחת לסף</span></div>
<h3>פעולות ובחירת תצוגה (כפתור אחד בפס העליון פותח את שתי הבחירות)</h3>
<div class="line"><a class="btn" href="#">לבנות את הכנסת שלי</a><a class="btn ghost" href="#">שיטה ומקורות</a></div>
<div class="line" style="margin-top:.75rem"><span style="font-weight:700">עיצוב</span><span class="seg"><span class="on">מקצועי</span><span>חדשותי</span></span><span style="font-weight:700">תצוגה</span><span class="seg"><span>יום</span><span>לילה</span><span class="on">לפי המכשיר</span></span></div>
<h3>שורת רשימה</h3>
<ol class="rank"><li class="row"><span class="nm">{ex["name"]}</span><span class="n num">{ex["central"]}</span><span class="plot" aria-hidden="true"><span class="bar" style="left:{ex["lo"] / MAXV * 100:.2f}%;width:{(ex["hi"] - ex["lo"]) / MAXV * 100:.2f}%"></span><span class="dot" style="left:{ex["central"] / MAXV * 100:.2f}%"></span></span><span class="rng"></span></li></ol>
<h3>שקיפות: "איך זה חושב?" נפתח כגיליון קצר, לא כפסקה</h3>
<div class="sheet-demo"><b>איך זה חושב?</b><dl><dt>סוג</dt><dd>תרחיש</dd><dt>מקור</dt><dd>{D["polls"]} סקרים מאומתים, מנוע החוק, 20,000 תרחישים</dd><dt>נכון ל-</dt><dd>{asof}</dd><dt>הנחה</dt><dd>טווח 80% מתרחישי יום הבחירות. לא תחזית ולא סיכוי.</dd></dl><p style="margin:.6rem 0 0"><a href="#">לשיטה המלאה</a></p></div>
<h3>באנר הקפאה (סעיף 16ה): אחד, מתחת לפס העליון, בכל עמוד</h3>
<div class="freeze" role="note"><p>הסקרים באתר אינם עדכניים. לפי חוק, מתום יום שישי שלפני הבחירות ועד סגירת הקלפיות לא מתפרסמים סקרים חדשים.</p></div>
<p class="note">רדיוס {'12px' if theme == 'league' else '10px'} · רווחים 4 · 8 · 12 · 16 · 24 · 32 · 48 · יעד נגיעה 44px לפחות · תנועה: רק מילוי המושבים בכניסה</p>
</section>'''


tok_body = '<div class="sheet">' + tile("league", False) + tile("board", False) + tile("league", True) + tile("board", True) + "</div>"
(OUT / "tokens-sheet.html").write_text(page("בחירות 26: טוקנים ורכיבים", tok_body, TOK_EXTRA, boot=False), encoding="utf-8")

json.dump({"acc": acc, "n_in": n_in, "n_all": n_all, "meretz_pct": thr, "dates": dates, "gov_n": gov_n, "moves": [(r["name"], r["d7"]) for r in moves]},
          open(GEN / "acc-data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("home:", gov_n, glo, ghi, [r["name"] for r in edge], [r["name"] for r in below], [(r["name"], r["d7"]) for r in moves])
print("accuracy:", n_in, n_all, round(thr, 3))
