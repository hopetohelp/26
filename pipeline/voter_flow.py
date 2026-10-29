"""מעבר מצביעים 2022 ⇐ 2026, לפי השוואת קלפיות (הכרעות בעלים 28–29.10.2026).

    python3 pipeline/voter_flow.py

קלט: raw/ballots-2022.csv (תוצאות האמת לפי קלפי) ו-raw/ballots-2026.csv (ועדת הבחירות, לפי קלפי);
raw/lineage.json (השיוך הוודאי בין הרשימות).
פלט: src/data/flow2026.json (המעברים) ו-public/flow-units.json (התוצאות לפי קלפי, לבדיקה במסך).

המודל (docs/הצעה-מעבר-מצביעים-לפי-תת-קלפי-29-10-2026.md): בכל יחידה, קולות כל רשימה ב-2026 = סכום קולות 2022 של כל
מקור (כולל "לא הצביעו") כפול החלק שעבר ממנו אליה. הנעלמים — טבלת המעבר.

הצמדת היחידות בין השנים — בדרגות, ובכל דרגה היתרה שלא הוצמדה עוברת לדרגה שמעליה (הכרעת בעלים 29.10.2026):
1. תת קלפי מהימנה — אותו יישוב, אותו מספר, אותו מתחם, ובעלי הזכות בתוך 10% אחרי גידול היישוב. מספר תת קלפי לבדו
   אינו מספיק: הוועדה מעבירה בוחרים בין קלפיות המתחם לפי שם המשפחה (חוק הבחירות, סעיף 68(ג1)).
2. יתרת המתחם (עמודת "ריכוז"). 3. יתרת היישוב. 4. יתרת הוועדה האזורית. 5. יתרה ארצית.
דרגות 3–5 רק במתג "לפי יישובים". בכל הדרגות נתוני 2022 מותאמים באחוזים למספר בעלי הזכות ב-2026 (הגידול באחוזים).

טבלאות המעבר — מדורגות: ארצית ⇐ ועדה ⇐ יישוב (שכונות נבדקו והוסרו: לא שיפרו את ההתאמה; הכרעת בעלים 29.10.2026). כל טבלה נפתרת מהיחידות שלה, ונמשכת לטבלה שמעליה
בכוח של KAPPA קולות לכל מקור: מקום עם מעט קלפיות קרוב לטבלה שמעליו, ומקום גדול נקבע מהנתונים שלו.
נקודת המוצא של הטבלה הארצית — השיוך הוודאי בלבד (raw/lineage.json, חלופת "strict"); השאר בלי הנחה.
אין שימוש בסקרים. זו הסקה סטטיסטית מקולות מצרפיים, לא מעקב אחרי בוחרים.

אף קול לא יוצא מהחשבון (הכרעת בעלים 28.10.2026): בכל יחידה הקולות האמיתיים של שתי השנים מחולקים לפי טבלת המקום —
flows: כל קול של 2026 לפי מקורו (סכום עמודה = הקולות שנספרו; בלי מקבילה ב-2022 — שורת "new", "יישובים חדשים");
flowsTo: כל קול של 2022 לפי יעדו (סכום שורה = התוצאה הרשמית). העיגול בשארית הגדולה, כך שהסכומים מדויקים עד הקול.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
B22, B26 = ROOT / "raw" / "ballots-2022.csv", ROOT / "raw" / "ballots-2026.csv"
OUT, UNITS = ROOT / "src" / "data" / "flow2026.json", ROOT / "public" / "flow-units.json"
LINEAGE, RESULTS = ROOT / "raw" / "lineage.json", ROOT / "src" / "data" / "results.json"

# הרשימות שעברו את אחוז החסימה ב-2022, ומרצ ובל"ד (מעל 2.5%); השאר ⇐ "other"
OLD = ["מחל", "פה", "ט", "כן", "שס", "ג", "ל", "עם", "ום", "אמת", "מרצ", "ד", "ב"]
# אותיות 2026 ⇐ מזהה ב-src/data/meta.json lists2026 (לפי מזהי JDN ב-fetch_results_2026.py)
NEW = {"מחל": "likud", "דרך": "yashar", "ודם": "joint", "רק": "together", "אמת": "democrats", "ג": "utj", "ל": "yb",
       "ב": "otzma", "שס": "shas", "ט": "rzp", "עם": "raam", "די": "reservists", "ך": "amcha",
       "נר": "code_black", "זך": "haredi_public", "ני": "noam"}
ITERATIONS = 300
# כוח המשיכה לטבלה שמעליה, בקולות לכל מקור (נבחר בבדיקת התאמה על קלפיות שהוסתרו; ראו מסמך ההצעה)
KAPPA = 20
# "מאיפה הגיעו" בעיר מוצג רק כשיש בה לפחות כך יחידות השוואה
MIN_CITY_UNITS = 30
TIERS = ["sub", "center", "city", "committee", "national"]
# תת קלפי מהימנה: בעלי הזכות ב-2026 מול 2022, אחרי גידול היישוב
SUB_TOLERANCE = 0.10


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


def match(r22: list[dict], r26: list[dict], full: bool) -> list[tuple[str, list[int], list[int]]]:
    """יחידות מותאמות (דרגה, אינדקסים של 2022, אינדקסים של 2026); כל קלפי פעם אחת, והיתרה עולה דרגה"""
    left22, left26, units = set(range(len(r22))), set(range(len(r26))), []
    e22, e26 = defaultdict(int), defaultdict(int)
    for r in r22:
        e22[r["סמל ישוב"]] += n(r, "בזב")
    for r in r26:
        e26[r["סמל ישוב"]] += n(r, "בזב")
    g22, g26 = defaultdict(list), defaultdict(list)
    for i, r in enumerate(r22):
        if n(r, "בזב") > 0:
            g22[(r["סמל ישוב"], float(r["קלפי"]))].append(i)
    for i, r in enumerate(r26):
        if n(r, "בזב") > 0:
            g26[(r["סמל ישוב"], float(r["קלפי"]))].append(i)
    for k in g22.keys() & g26.keys():
        i22, i26 = g22[k], g26[k]
        growth = e26[k[0]] / e22[k[0]] if e22[k[0]] else 1
        b22, b26 = sum(n(r22[i], "בזב") for i in i22), sum(n(r26[i], "בזב") for i in i26)
        same = {r22[i]["ריכוז"] for i in i22} == {r26[i]["ריכוז"] for i in i26}
        if same and abs(b26 / (b22 * growth) - 1) <= SUB_TOLERANCE:
            units.append(("sub", i22, i26))
            left22 -= set(i22)
            left26 -= set(i26)
    keys = [("center", lambda r: (r["סמל ישוב"], r["ריכוז"]))]
    if full:
        keys += [("city", lambda r: (r["סמל ישוב"],)), ("committee", lambda r: (r["סמל ועדה"],)), ("national", lambda r: ())]
    for tier, key in keys:
        g22, g26 = defaultdict(list), defaultdict(list)
        for i in left22:
            g22[key(r22[i])].append(i)
        for i in left26:
            g26[key(r26[i])].append(i)
        for k in g26.keys() if tier == "national" else g22.keys() & g26.keys():
            units.append((tier, sorted(g22.get(k, [])), sorted(g26[k])))
            left22 -= set(g22.get(k, []))
            left26 -= set(g26[k])
    return units


def prior(I: int, J: int) -> np.ndarray:
    """נקודת המוצא הארצית: רק השיוך הוודאי (raw/lineage.json, "strict"; הכרעת בעלים 29.10.2026) — כל מקור עם ממשיך ודאי
    נותן לממשיכיו את רוב המשקל; השאר אחיד. זו נקודת מוצא בלבד: הנתונים מזיזים אותה"""
    k25 = next(e for e in json.loads(RESULTS.read_text(encoding="utf-8")) if e["knesset"] == 25)
    letters = {l["short"]: l["letters"] for l in k25["lists"]}
    ids = {v: k for k, v in NEW.items()}
    new = list(NEW)
    P = np.full((I, J), 1 / J)
    for fam in json.loads(LINEAGE.read_text(encoding="utf-8"))["families"]:
        if "strict" not in fam["alts"]:
            continue
        cols = [new.index(ids[x]) for x in fam["k26"] if x in ids]
        for name in fam["k25"]:
            if letters.get(name) in OLD and cols:
                row = np.full(J, 0.3 / J)
                row[cols] += 0.7 / len(cols)
                P[OLD.index(letters[name])] = row
    return P


def fit(X: np.ndarray, Y: np.ndarray, base: np.ndarray, kappa: float) -> np.ndarray:
    """הטבלה שמסבירה הכי טוב את כל היחידות (עדכונים כפליים של מרחק KL), נמשכת ל-base בכוח kappa קולות לכל מקור"""
    P = base.copy()
    for _ in range(ITERATIONS):
        R = Y / np.maximum(X @ P, 1e-9)
        C = P * (X.T @ R) + kappa * base
        P = C / np.maximum(C.sum(1, keepdims=True), 1e-12)
    return P


def tables(units, pairs, r26, I: int, J: int, kappa: float = KAPPA) -> list[np.ndarray]:
    """טבלה לכל יחידה, מהמקום העמוק ביותר שלה: ארצי ⇐ ועדה ⇐ יישוב"""
    def path(tier, i26):
        r = r26[i26[0]]
        p = [("nat",)]
        if tier in ("national",):
            return p
        p.append(("com", r["סמל ועדה"]))
        if tier == "committee":
            return p
        p.append(("city", r["סמל ישוב"]))
        return p
    paths = [path(t, b) if b else [("nat",)] for t, _, b in units]
    X = np.array([np.maximum(x, 0) for x, _ in pairs], float)
    Y = np.array([np.maximum(y, 0) for _, y in pairs], float)
    members = defaultdict(list)
    for u, p in enumerate(paths):
        for depth in range(len(p)):
            members[tuple(p[: depth + 1])].append(u)
    solved = {(("nat",),): fit(X, Y, prior(I, J), kappa)}
    for node in sorted(members, key=len):
        if node in solved:
            continue
        idx = members[node]
        solved[node] = fit(X[idx], Y[idx], solved[node[:-1]], kappa)
    return [solved[tuple(p)] for p in paths]


def unit_pair(tier: str, i22: list[int], i26: list[int], r22, r26, v22, v26) -> tuple[list[float], list[int]]:
    x = [sum(v22[i][k] for i in i22) for k in range(len(v22[0]))]  # יתרה ארצית בלי קלפי 2022 ⇐ אפסים ("יישובים חדשים")
    y = [sum(v26[i][k] for i in i26) for k in range(len(v26[0]))]
    # גידול באחוזים (הכרעת בעלים 29.10.2026): נתוני 2022 של היחידה מוכפלים ביחס בעלי הזכות 2026/2022, כך שכל מקור
    # הוא "החלק הזה מאוכלוסיית היחידה, כולל הגידול שלו". נבדק מול "הגידול ⇐ לא הצביעו" ו"הגידול ⇐ מקור נפרד":
    # 7.41% קולות משויכים לא נכון, לעומת 8.54% ו-8.17%
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


def exact(units, r22, r26, v22, v26, Ps, I: int, J: int, left: bool):
    """הקולות האמיתיים ⇐ שני כיווני המעבר, בלי שאף קול ייצא מהחשבון (הכרעת בעלים 28.10.2026):
    F — כל קול של 2026 משויך למקורו ב-2022 (שורה נוספת אחרונה: "יישובים חדשים", בלי קלפי ב-2022); סכום כל עמודה = הקולות שנספרו.
    T — כל קול של 2022 משויך ליעדו ב-2026; סכום כל שורה = התוצאה הרשמית של 2022.
    בכל יחידה מותאמת החלוקה לפי טבלת המקום שלה (Ps, טבלה לכל יחידה); קלפיות שעדיין אין להן מקבילה (left) — לפי השינוי באותו יישוב, ואם אין בו — לפי כל הארץ."""
    F = [[0.0] * J for _ in range(I + 1)]
    T = [[0.0] * J for _ in range(I)]
    cF = defaultdict(lambda: [[0.0] * J for _ in range(I + 1)])
    cT = defaultdict(lambda: [[0.0] * J for _ in range(I)])
    used22, used26 = set(), set()
    for (tier, i22, i26), P in zip(units, Ps):
        P = P.tolist() if hasattr(P, "tolist") else P
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
            if not sum(xs):
                F[I][j] += ys[j]  # אין קולות 2022 ביחידה ⇐ "יישובים חדשים"
                cF[city][I][j] += ys[j]
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


def cities(r22: list[dict], r26: list[dict], units, Ps) -> dict:
    """לכל עיר עם לפחות MIN_CITY_UNITS יחידות (במתג היישובים): המעברים בסכומי אמת של העיר, לפי הטבלאות המדורגות"""
    v22, v26 = [vector(r, OLD) for r in r22], [vector(r, list(NEW)) for r in r26]
    by = defaultdict(list)
    for u, P in zip(units, Ps):
        if u[0] in ("sub", "center", "city"):
            by[r26[u[2][0]]["סמל ישוב"]].append((u, P))
    out = {}
    I, J = len(OLD) + 2, len(NEW) + 2
    for code, items in by.items():
        if len(items) < MIN_CITY_UNITS:
            continue
        us, ps = zip(*items)
        Fi, Ti = exact(list(us), r22, r26, v22, v26, list(ps), I, J, False)
        out[code] = {"units": len(us), "flows": Fi, "flowsTo": Ti}
    return out


def counted(r26: list[dict]) -> dict:
    """"נתונים חלקיים X% מהמצביעים HH:MM": המצביעים בקלפיות שבקובץ מתוך כלל המצביעים (מפת ההצבעה), ושעת הקובץ"""
    total = json.loads((ROOT / "public" / "turnout.json").read_text(encoding="utf-8"))["total"]["מצביעים"]
    res = json.loads((ROOT / "raw" / "results-2026.json").read_text(encoding="utf-8"))
    voters = sum(n(r, "מצביעים") for r in r26)
    # eligible — בעלי זכות הבחירה באותן קלפיות: המכנה של "מזכות בחירה" ב-2026 (כרטיסי "מה השתנה" ותמונות השיתוף)
    # voters ו-invalid — מאותן קלפיות: כרטיסי ההשוואה בראש "מה השתנה" (הכרעת בעלים 29.10.2026)
    return {"pct": round(voters / total * 100, 1), "time": str(res.get("asOf") or "").split(" ")[-1], "eligible": sum(n(r, "בזב") for r in r26),
            "voters": voters, "invalid": sum(n(r, "פסולים") for r in r26)}


def mode(r22: list[dict], r26: list[dict], full: bool) -> tuple[dict, list, list]:
    new = list(NEW)
    v22 = [vector(r, OLD) for r in r22]
    v26 = [vector(r, new) for r in r26]
    units = match(r22, r26, full)
    pairs, tiers = [], {t: {"units": 0, "valid": 0} for t in TIERS}
    for tier, i22, i26 in units:
        pairs.append(unit_pair(tier, i22, i26, r22, r26, v22, v26))
        tiers[tier]["units"] += 1
        tiers[tier]["valid"] += sum(n(r26[i], "כשרים") for i in i26)
    I, J = len(OLD) + 2, len(new) + 2
    Ps = tables(units, pairs, r26, I, J)
    Fi, Ti = exact(units, r22, r26, v22, v26, Ps, I, J, True)
    return {"flows": Fi, "flowsTo": Ti, "tiers": tiers}, units, Ps


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
    ballots, _, _ = mode(r22, r26, False)
    localities, units, Ps = mode(r22, r26, True)
    now = datetime.now(timezone(timedelta(hours=2)))
    data = {
        "asOf": f"{now.day}/{now.month}/{now.year}",
        "old": OLD + ["other", "abstain", "new"],
        "new": list(NEW.values()) + ["other", "abstain"],
        "letters26": NEW,
        "ballots2026": len(r26),
        "valid2026": sum(n(r, "כשרים") for r in r26),
        "counted": counted(r26),
        "modes": {"ballots": ballots, "localities": localities},
        "cities": cities(r22, r26, units, Ps),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    UNITS.write_text(json.dumps(units_file(r22, r26), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for k, m in data["modes"].items():
        print(k, {t: v["valid"] for t, v in m["tiers"].items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
