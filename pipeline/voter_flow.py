"""מעבר מצביעים 2022 ⇐ 2026, לפי השוואת כל קלפי לאותה קלפי (הכרעות בעלים 28.10.2026).

    python3 pipeline/voter_flow.py

קלט: raw/ballots-2022.csv (תוצאות האמת לפי קלפי, data.gov.il) ו-raw/ballots-2026.csv (ועדת הבחירות, לפי קלפי).
פלט: src/data/flow2026.json (המעברים) ו-public/flow-units.json (התוצאות לפי קלפי, לבדיקה במסך).

ההתאמה בדרגות; כל קלפי משמשת פעם אחת, בדרגה המדויקת ביותר שבה נמצאה לה מקבילה:
1. תת קלפי — אותו יישוב ואותו מספר קלפי בדיוק (למשל 8.3 מול 8.3).
2. קלפי — אותו יישוב ואותו מספר שלם; תתי הקלפי מאוחדות (24.1–24.4 מול 24).
3. מיקום — אותו יישוב ואותו מרכז קלפיות (עמודת "ריכוז", הבניין), לשאר הקלפיות שבו.
4. יישוב (רק במתג "לפי יישובים") — יישוב שנותרו בו קלפיות בלי מקבילה נמדד כולו כיחידה אחת;
   המעטפות הכפולות (סמל 9999) הן יישוב אחד.
בדרגות 2–4 הנתונים של 2022 מותאמים למספר בעלי זכות הבחירה ביחידה ב-2026, כי הספירה ב-2026 עשויה להיות חלקית.
בדרגה 1 אין התאמה כזו: קלפי תמיד נשארת אותה קלפי.

מטריצת מעבר אחת לכל הארץ: איזה חלק ממצביעי כל רשימה של 2022 (כולל "לא הצביעו") הצביע לכל רשימה של 2026,
כך שתחזית כל היחידות תהיה הקרובה ביותר לתוצאה בכל יחידה (עדכונים כפליים של מרחק KL; כל שורה מסתכמת ב-1).
אין שימוש בסקרים, בשיוך ידני או במודל.

אף קול לא יוצא מהחשבון (הכרעת בעלים 28.10.2026): בכל יחידה הקולות האמיתיים של שתי השנים מחולקים לפי שיעורי המעבר —
flows: כל קול של 2026 לפי מקורו (סכום עמודה = הקולות שנספרו; ביישוב בלי קלפי ב-2022 — שורת "new", "יישובים חדשים");
flowsTo: כל קול של 2022 לפי יעדו (סכום שורה = התוצאה הרשמית). קלפי שעדיין אין לה מקבילה — לפי השינוי באותו יישוב,
ואם אין בו עדיין קלפי שנספרה — לפי כל הארץ. העיגול בשארית הגדולה, כך שהסכומים מדויקים עד הקול.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
B22, B26 = ROOT / "raw" / "ballots-2022.csv", ROOT / "raw" / "ballots-2026.csv"
OUT, UNITS = ROOT / "src" / "data" / "flow2026.json", ROOT / "public" / "flow-units.json"

# הרשימות שעברו את אחוז החסימה ב-2022, ומרצ ובל"ד (מעל 2.5%); השאר ⇐ "other"
OLD = ["מחל", "פה", "ט", "כן", "שס", "ג", "ל", "עם", "ום", "אמת", "מרצ", "ד", "ב"]
# אותיות 2026 ⇐ מזהה ב-src/data/meta.json lists2026 (לפי מזהי JDN ב-fetch_results_2026.py)
NEW = {"מחל": "likud", "דרך": "yashar", "ודם": "joint", "רק": "together", "אמת": "democrats", "ג": "utj", "ל": "yb",
       "ב": "otzma", "שס": "shas", "ט": "rzp", "עם": "raam", "די": "reservists", "ך": "amcha",
       "נר": "code_black", "זך": "haredi_public", "ני": "noam"}
ITERATIONS = 300
# "מאיפה הגיעו" בעיר — רק כשיש בה לפחות כך יחידות השוואה; פחות מזה ההערכה לא יציבה
MIN_CITY_UNITS = 30
TIERS = ["sub", "ballot", "center", "city"]


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def n(row: dict, k: str) -> int:
    return int(float(row.get(k) or 0))


def vector(row: dict, letters: list[str]) -> list[int]:
    """קולות לכל רשימה, "אחרות" ו"לא הצביעו". אף ערך אינו שלילי: במעטפות החיצוניות אין בעלי זכות בקלפי (בזב 0),
    ו"לא הצביעו" שלילי שם שיבש את כל המטריצה (29.10.2026, כשנספרו עוד מעטפות)"""
    v = [n(row, k) for k in letters]
    return v + [max(0, n(row, "כשרים") - sum(v)), max(0, n(row, "בזב") - n(row, "מצביעים"))]


KEYS = {
    "sub": lambda r: (r["סמל ישוב"], float(r["קלפי"])),
    "ballot": lambda r: (r["סמל ישוב"], int(float(r["קלפי"]))),
    "center": lambda r: (r["סמל ישוב"], r["ריכוז"]),
    "city": lambda r: (r["סמל ישוב"],),
}


def match(r22: list[dict], r26: list[dict], by_city: bool) -> list[tuple[str, list[int], list[int]]]:
    """יחידות מותאמות: (דרגה, אינדקסים של 2022, אינדקסים של 2026)"""
    left22, left26, units = set(range(len(r22))), set(range(len(r26))), []
    for tier in TIERS[:3]:
        g22, g26 = defaultdict(list), defaultdict(list)
        for i in left22:
            g22[KEYS[tier](r22[i])].append(i)
        for i in left26:
            g26[KEYS[tier](r26[i])].append(i)
        for k in g22.keys() & g26.keys():
            units.append((tier, g22[k], g26[k]))
            left22 -= set(g22[k])
            left26 -= set(g26[k])
    if by_city:
        # הקלפיות שנותרו בכל יישוב (בשתי השנים) ⇐ יחידה אחת; יישוב שנותרו בו קלפיות רק באחת השנים ⇐ היישוב כולו יחידה אחת
        g22, g26 = defaultdict(list), defaultdict(list)
        for i in left22:
            g22[r22[i]["סמל ישוב"]].append(i)
        for i in left26:
            g26[r26[i]["סמל ישוב"]].append(i)
        units += [("city", g22[k], g26[k]) for k in g22.keys() & g26.keys()]
        whole = g26.keys() - g22.keys()
        units = [u for u in units if r26[u[2][0]]["סמל ישוב"] not in whole]
        a22, a26 = defaultdict(list), defaultdict(list)
        for i, r in enumerate(r22):
            if r["סמל ישוב"] in whole:
                a22[r["סמל ישוב"]].append(i)
        for i, r in enumerate(r26):
            if r["סמל ישוב"] in whole:
                a26[r["סמל ישוב"]].append(i)
        units += [("city", a22[k], a26[k]) for k in a22.keys() & a26.keys()]
    return units


def fit(pairs: list[tuple[list[float], list[int]]], I: int, J: int) -> list[list[float]]:
    P = [[1 / J] * J for _ in range(I)]
    for _ in range(ITERATIONS):
        num, den = [[0.0] * J for _ in range(I)], [0.0] * I
        for xs, ys in pairs:
            yh = [sum(xs[i] * P[i][j] for i in range(I)) or 1e-9 for j in range(J)]
            rt = [ys[j] / yh[j] for j in range(J)]
            for i in range(I):
                if xs[i]:
                    den[i] += xs[i]
                    for j in range(J):
                        num[i][j] += xs[i] * rt[j]
        P = [[P[i][j] * num[i][j] / den[i] if den[i] else P[i][j] for j in range(J)] for i in range(I)]
        P = [[v / sum(row) for v in row] for row in P]
    return P


def unit_pair(tier: str, i22: list[int], i26: list[int], r22, r26, v22, v26) -> tuple[list[float], list[int]]:
    x = [sum(v22[i][k] for i in i22) for k in range(len(v22[0]))]
    y = [sum(v26[i][k] for i in i26) for k in range(len(v26[0]))]
    if tier != "sub":
        e22, e26 = sum(n(r22[i], "בזב") for i in i22), sum(n(r26[i], "בזב") for i in i26)
        x = [v * e26 / e22 for v in x] if e22 else x
    return x, y


def apportion(values: list[float], total: int) -> list[int]:
    """עיגול בשארית הגדולה: סכום השלמים = total בדיוק (אף קול לא נוסף ולא נגרע בעיגול)"""
    weight = sum(values)
    values = [v * total / weight for v in values] if weight else [total / len(values)] * len(values)
    base = [int(v) for v in values]
    order = sorted(range(len(values)), key=lambda k: values[k] - base[k], reverse=True)
    for k in order[: max(0, total - sum(base))]:
        base[k] += 1
    return base


def exact(units, r22, r26, v22, v26, P, I: int, J: int, left: bool):
    """הקולות האמיתיים ⇐ שני כיווני המעבר, בלי שאף קול ייצא מהחשבון (הכרעת בעלים 28.10.2026):
    F — כל קול של 2026 משויך למקורו ב-2022 (שורה נוספת אחרונה: "יישובים חדשים", בלי קלפי ב-2022); סכום כל עמודה = הקולות שנספרו.
    T — כל קול של 2022 משויך ליעדו ב-2026; סכום כל שורה = התוצאה הרשמית של 2022.
    בכל יחידה מותאמת החלוקה לפי שיעורי המעבר P; קלפיות שעדיין אין להן מקבילה (left) — לפי השינוי באותו יישוב, ואם אין בו — לפי כל הארץ."""
    F = [[0.0] * J for _ in range(I + 1)]
    T = [[0.0] * J for _ in range(I)]
    cF = defaultdict(lambda: [[0.0] * J for _ in range(I + 1)])
    cT = defaultdict(lambda: [[0.0] * J for _ in range(I)])
    used22, used26 = set(), set()
    for tier, i22, i26 in units:
        xs, ys = unit_pair(tier, i22, i26, r22, r26, v22, v26)
        xs = [max(0.0, v) for v in xs]
        xa = [sum(v22[i][k] for i in i22) for k in range(I)]
        city = r26[i26[0]]["סמל ישוב"]
        used22.update(i22)
        used26.update(i26)
        yhat = [sum(xs[i] * P[i][j] for i in range(I)) for j in range(J)]
        for j in range(J):
            if ys[j] <= 0:
                continue
            w = [xs[i] * P[i][j] for i in range(I)]
            t = sum(w) or sum(xs)
            w = w if sum(w) else list(xs)
            for i in range(I):
                F[i][j] += ys[j] * w[i] / t
                cF[city][i][j] += ys[j] * w[i] / t
        for i in range(I):
            if xa[i] <= 0:
                continue
            w = [P[i][j] * (ys[j] / yhat[j] if yhat[j] > 0 else 0) for j in range(J)]
            w = w if sum(w) else list(P[i])
            t = sum(w)
            for j in range(J):
                T[i][j] += xa[i] * w[j] / t
                cT[city][i][j] += xa[i] * w[j] / t
    if left:
        nF, nT = [row[:] for row in F], [row[:] for row in T]
        codes22 = {r["סמל ישוב"] for r in r22}
        g26, g22 = defaultdict(list), defaultdict(list)
        for i in set(range(len(r26))) - used26:
            g26[r26[i]["סמל ישוב"]].append(i)
        for i in set(range(len(r22))) - used22:
            g22[r22[i]["סמל ישוב"]].append(i)
        for city, idx in g26.items():
            y = [sum(v26[i][j] for i in idx) for j in range(J)]
            for j in range(J):
                if y[j] <= 0:
                    continue
                if city not in codes22:
                    F[I][j] += y[j]
                    continue
                col = [cF[city][i][j] for i in range(I + 1)] if city in cF else []
                if not sum(col):
                    col = [nF[i][j] for i in range(I + 1)]
                for i in range(I + 1):
                    F[i][j] += y[j] * col[i] / (sum(col) or 1)
        for city, idx in g22.items():
            x = [sum(v22[i][k] for i in idx) for k in range(I)]
            for i in range(I):
                if x[i] <= 0:
                    continue
                row = cT[city][i] if city in cT and sum(cT[city][i]) else nT[i]
                for j in range(J):
                    T[i][j] += x[i] * row[j] / (sum(row) or 1)
    # סכומי אמת: עמודות F = הקולות שנספרו ב-2026 בקלפיות האלה; שורות T = הקולות של 2022 בקלפיות האלה
    rows26 = list(range(len(r26))) if left else sorted(used26)
    rows22 = list(range(len(r22))) if left else sorted(used22)
    col_tot = [max(0, sum(v26[i][j] for i in rows26)) for j in range(J)]
    row_tot = [max(0, sum(v22[i][k] for i in rows22)) for k in range(I)]
    Fi = [[0] * J for _ in range(I + 1)]
    for j in range(J):
        c = apportion([max(0.0, F[i][j]) for i in range(I + 1)], round(sum(max(0.0, F[i][j]) for i in range(I + 1))) if j == J - 1 else col_tot[j])
        for i in range(I + 1):
            Fi[i][j] = c[i]
    Ti = [apportion([max(0.0, v) for v in T[i]], row_tot[i] if i < I - 1 else round(sum(max(0.0, v) for v in T[i]))) for i in range(I)]
    Ti.append([0] * J)  # "יישובים חדשים" — אין להם 2022
    return Fi, Ti


def cities(r22: list[dict], r26: list[dict]) -> dict:
    """לכל עיר עם לפחות MIN_CITY_UNITS יחידות (במתג היישובים): מטריצת מעבר משלה, בסכומי אמת של העיר"""
    v22, v26 = [vector(r, OLD) for r in r22], [vector(r, list(NEW)) for r in r26]
    by = defaultdict(list)
    for u in match(r22, r26, True):
        by[r26[u[2][0]]["סמל ישוב"]].append(u)
    out = {}
    I, J = len(OLD) + 2, len(NEW) + 2
    for code, units in by.items():
        if len(units) < MIN_CITY_UNITS:
            continue
        P = fit([unit_pair(*u, r22, r26, v22, v26) for u in units], I, J)
        Fi, Ti = exact(units, r22, r26, v22, v26, P, I, J, False)
        out[code] = {"units": len(units), "flows": Fi, "flowsTo": Ti}
    return out


def counted(r26: list[dict]) -> dict:
    """"נתונים חלקיים X% מהמצביעים HH:MM": המצביעים בקלפיות שבקובץ מתוך כלל המצביעים (מפת ההצבעה), ושעת הקובץ"""
    total = json.loads((ROOT / "public" / "turnout.json").read_text(encoding="utf-8"))["total"]["מצביעים"]
    res = json.loads((ROOT / "raw" / "results-2026.json").read_text(encoding="utf-8"))
    voters = sum(n(r, "מצביעים") for r in r26)
    # eligible — בעלי זכות הבחירה באותן קלפיות: המכנה של "מזכות בחירה" ב-2026 (כרטיסי "מה השתנה" ותמונות השיתוף)
    return {"pct": round(voters / total * 100, 1), "time": str(res.get("asOf") or "").split(" ")[-1], "eligible": sum(n(r, "בזב") for r in r26)}


def mode(r22: list[dict], r26: list[dict], by_city: bool) -> dict:
    new = list(NEW)
    v22 = [vector(r, OLD) for r in r22]
    v26 = [vector(r, new) for r in r26]
    units = match(r22, r26, by_city)
    pairs, tiers = [], {t: {"units": 0, "valid": 0} for t in TIERS}
    for tier, i22, i26 in units:
        pairs.append(unit_pair(tier, i22, i26, r22, r26, v22, v26))
        tiers[tier]["units"] += 1
        tiers[tier]["valid"] += sum(n(r26[i], "כשרים") for i in i26)
    I, J = len(OLD) + 2, len(new) + 2
    Fi, Ti = exact(units, r22, r26, v22, v26, fit(pairs, I, J), I, J, True)
    return {"flows": Fi, "flowsTo": Ti, "tiers": tiers}


def units_file(r22: list[dict], r26: list[dict]) -> dict:
    """התוצאות לפי קלפי לשתי השנים, לבדיקה במסך: יישוב ⇐ [מספר, ריכוז, בעלי זכות, מצביעים, ...קולות]"""
    names, out = {}, {"letters22": OLD + ["other"], "letters26": list(NEW) + ["other"], "places": {}}
    for year, rows, letters in (("y22", r22, OLD), ("y26", r26, list(NEW))):
        for r in rows:
            code = r["סמל ישוב"]
            names[code] = r["שם ישוב"].strip()
            v = vector(r, letters)[:-1]
            out["places"].setdefault(code, {"name": "", "y22": [], "y26": []})[year].append(
                [r["קלפי"], r["ריכוז"], n(r, "בזב"), n(r, "מצביעים"), *v])
    for code, p in out["places"].items():
        p["name"] = names[code]
    return out


def main() -> int:
    r22, r26 = read(B22), read(B26)
    now = datetime.now(timezone(timedelta(hours=2)))
    data = {
        "asOf": f"{now.day}/{now.month}/{now.year}",
        "old": OLD + ["other", "abstain", "new"],
        "new": list(NEW.values()) + ["other", "abstain"],
        "letters26": NEW,
        "ballots2026": len(r26),
        "valid2026": sum(n(r, "כשרים") for r in r26),
        "counted": counted(r26),
        "modes": {"ballots": mode(r22, r26, False), "localities": mode(r22, r26, True)},
        "cities": cities(r22, r26),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    UNITS.write_text(json.dumps(units_file(r22, r26), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for k, m in data["modes"].items():
        print(k, {t: v["valid"] for t, v in m["tiers"].items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
