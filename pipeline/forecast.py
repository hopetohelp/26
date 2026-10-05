"""מודל החיזוי לתוצאות האמת — לפי התוכנית שנקבעה בדיון המעמיק (close-family#2445) ובהכרעות הבעלים.

מודל אחד, באותם כללים בכל מערכת. רק המספרים נאמדים מהנתונים — וכל אחד מהם רק מהמערכות שקדמו לזו שנחזית:
1. מכל מכון — הסקר האחרון שלו בשבוע שלפני החיתוך (4 ימים לפני הבחירות), רק אם אומת מול המקור.
   סקר מנדטים ⇐ אחוזים דרך מודל התצפית של model.py (קופסת המנוע המדויקת, בסף שהיה בתוקף).
2. לכל סדרת מכון — הטעות שלו בכל מערכת קודמת (מרחק כולל בין התחזית לתוצאה), ומגמת השיפור **שנמדדה בפועל**:
   רגרסיה של לוג-הטעות על מספר המערכת, עם שיפוע מכווץ לאפס. משקל = 1/טעות², מכווץ, קטום ל-0.5–2, תקרה 40%.
3. תיקון הטיה לפי גוש — משותף לכל המכונים ואישי לכל מכון (מכווץ), באותה רגרסיה עם מגמה.
4. רכיב משותף למפלגות שממשיכות (מטבלת שושלת קפואה), ורכיב סף לרשימות שקרובות לסף — שניהם משאריות השלבים הקודמים.
5. ממוצע משוקלל ⇐ המנוע עם ההסכמים וסף המערכת ⇐ מנדטים ("התרחיש המרכזי").

דיוק: קולות = 1 − ½·Σ|p̂−p| על יחידות ההשוואה (רשימה עם 1% ומעלה בתחזית או בתוצאה; השאר "אחרות").
מנדטים = 1 − Σ|ŝ−s|/240.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median

import model as M

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
DATA = ROOT / "src" / "data"

SPEC_PATH = Path(__file__).resolve().parent / "forecast_spec.json"


def load_spec() -> dict:
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- נתונים

@dataclass
class Election:
    knesset: int
    date: str
    threshold: tuple[int, int]
    valid: int
    votes: dict[str, int]
    seats: dict[str, int]
    agreements: list[tuple[str, str]]
    lists: dict[str, dict]  # אותיות ⇐ {"bloc": ..., "party": ...}

    def shares(self) -> dict[str, float]:
        return {k: v / self.valid for k, v in self.votes.items()}


@dataclass
class Poll:
    id: str
    knesset: int
    series: str
    field_end: str
    values: dict[str, dict]  # אותיות ⇐ {"s": מנדטים} או {"p": אחוז}
    level: str = "primary"
    shares: dict[str, float] = field(default_factory=dict)


def _sum_csv(path: Path, skip: set[str]) -> dict[str, int]:
    tot: dict[str, int] = {}
    with path.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            for k, v in row.items():
                if k in skip:
                    continue
                tot[k] = tot.get(k, 0) + int(float(v or 0))
    return tot


def load_elections(spec: dict) -> dict[int, Election]:
    res = {r["knesset"]: r for r in json.loads((DATA / "results.json").read_text(encoding="utf-8"))}
    out = {}
    for ks, meta in spec["elections"].items():
        k = int(ks)
        thr = tuple(meta["threshold"])
        if k in res:
            r = res[k]
            votes = {l["letters"]: l["votes"] for l in r["lists"]}
            seats = {l["letters"]: l["seats"] for l in r["lists"]}
            valid, agreements = r["valid"], [tuple(a) for a in r["agreements"]]
        else:
            tot = _sum_csv(RAW / "cec" / meta["file"], set(meta["skipColumns"]))
            valid = tot.pop("כשרים")
            for c in ("בזב", "מצביעים", "פסולים", "סמל ועדה"):
                tot.pop(c, None)
            votes = {k2: v for k2, v in tot.items() if v > 0}
            agreements = [tuple(a) for a in meta["agreements"]]
            idx = {k2: i for i, k2 in enumerate(votes)}
            s = M.fast_seats(list(votes.values()), valid, [(idx[a], idx[b]) for a, b in agreements if a in idx and b in idx],
                             threshold=thr)
            seats = {k2: s[i] for k2, i in idx.items()}
            if {k2: v for k2, v in seats.items() if v} != meta["officialSeats"]:
                raise SystemExit(f"K{k}: המנוע אינו משחזר את המנדטים הרשמיים")
        out[k] = Election(k, meta["date"], thr, valid, votes, seats, agreements, meta["lists"])
    return out


def load_polls(spec: dict) -> list[Poll]:
    """הסקרים שאומתו (raw/forecast/polls.json). רק רשומה עם סטטוס תקף נכנסת לריצה הראשית."""
    rows = json.loads((RAW / "forecast" / "polls.json").read_text(encoding="utf-8"))
    ok = set(spec["data"]["validStatuses"])
    levels = set(spec["data"]["sourceLevels"])
    return [Poll(r["id"], r["knesset"], r["series"], r["fieldEnd"], r["values"], r.get("sourceLevel", "primary"))
            for r in rows if r["status"] in ok and r.get("sourceLevel", "primary") in levels]


def final_week(polls: list[Poll], e: Election, spec: dict, horizon: int) -> list[Poll]:
    """הסקר האחרון של כל סדרה, שהסתיים בשטח בשבוע שמסתיים horizon ימים לפני הבחירות (כולל).
    האופק הוא פרמטר (הכרעת בעלים): המכונים מצמצמים את הפער ככל שהבחירות מתקרבות, ולכן הטעות, המשקל וההטיה
    נאמדים מהסקרים שהיו באותו מרחק מהבחירות במערכות הקודמות."""
    from datetime import date, timedelta
    d = date.fromisoformat(e.date)
    cut = d - timedelta(days=horizon)
    lo = cut - timedelta(days=spec["data"]["windowDays"])
    last: dict[str, Poll] = {}
    for p in polls:
        if p.knesset != e.knesset:
            continue
        fe = date.fromisoformat(p.field_end)
        if lo < fe <= cut and (p.series not in last or p.field_end > last[p.series].field_end):
            last[p.series] = p
    return sorted(last.values(), key=lambda p: p.series)


# ---------------------------------------------------------------- מסקר לאחוזים

def poll_shares(p: Poll, e_lists: list[str], agreements: list[tuple[str, str]], threshold: tuple[int, int],
                seed: int) -> dict[str, float]:
    """אחוזים לכל רשימה בסקר. סקר שפרסם רק מנדטים ⇐ מודל התצפית (model.py) עם הסף של אותה מערכת."""
    if any(isinstance(v.get("s"), float) and v["s"] != int(v["s"]) for v in p.values.values()):
        # מנדטים עם חצאים (גיאוקרטוגרפיה 2013): אין קופסת מנוע — אחוז ≈ מנדטים/120, אחרי "שריפה" ממוצעת
        tot = sum(v.get("s", 0) for v in p.values.values())
        mid = sum(M.ObsConfig().wasted_default) / 2
        return {k: v["s"] / tot * (1 - mid) for k, v in p.values.items() if v.get("s")}
    p = Poll(p.id, p.knesset, p.series, p.field_end,
             {k: ({"s": int(v["s"])} if "s" in v else v) for k, v in p.values.items()}, p.level)
    seats = {k: v for k, v in p.values.items() if isinstance(v.get("s"), int) and v["s"] > 0}
    if not seats:
        return {}
    ref = max(seats, key=lambda k: seats[k]["s"])
    rng = random.Random(f"{seed}|{p.id}")
    cfg = M.ObsConfig()
    o = M.observe_poll(p.id, p.series, 0, p.values, None, agreements, ref, cfg, rng, threshold=threshold)
    sh = dict(o.share)
    return sh


# ---------------------------------------------------------------- מדדים

def units(pred: dict[str, float], actual: dict[str, float], min_share: float) -> list[str]:
    return sorted({k for k, v in actual.items() if v >= min_share} | {k for k, v in pred.items() if v >= min_share})


def vote_accuracy(pred: dict[str, float], actual: dict[str, float], min_share: float) -> float:
    u = units(pred, actual, min_share)
    p_oth = max(0.0, 1 - sum(pred.get(k, 0) for k in u))
    a_oth = max(0.0, 1 - sum(actual.get(k, 0) for k in u))
    tv = sum(abs(pred.get(k, 0) - actual.get(k, 0)) for k in u) + abs(p_oth - a_oth)
    return 1 - tv / 2


def seat_accuracy(pred: dict[str, int], actual: dict[str, int]) -> float:
    keys = set(pred) | set(actual)
    return 1 - sum(abs(pred.get(k, 0) - actual.get(k, 0)) for k in keys) / 240


def seats_from_shares(sh: dict[str, float], agreements: list[tuple[str, str]], threshold: tuple[int, int]) -> dict[str, int]:
    names = list(sh)
    idx = {k: i for i, k in enumerate(names)}
    votes = [max(0, int(round(sh[k] * M.VALID))) for k in names]
    s = M.fast_seats(votes, M.VALID, [(idx[a], idx[b]) for a, b in agreements if a in idx and b in idx],
                     threshold=threshold)
    return {k: s[i] for k, i in idx.items()}


# ---------------------------------------------------------------- רכיבי המודל

def _shrunk_trend(points: list[tuple[float, float]], prior: float, strength: float, t: float) -> float:
    """רגרסיה פשוטה y = a + b·x, עם כיווץ לממוצע המאוחד (prior) ושיפוע מכווץ לאפס; מחזיר את התחזית בנקודה t.
    n תצפיות ⇐ משקל n/(n+strength) לאומדן של המכון; השיפוע מכווץ ב-(n−1)/(n−1+strength)."""
    n = len(points)
    if n == 0:
        return prior
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = (sum((x - mx) * (y - my) for x, y in points) / sxx) if n >= 2 and sxx > 0 else 0.0
    b *= (n - 1) / (n - 1 + strength)
    own = my + b * (t - mx)
    w = n / (n + strength)
    return w * own + (1 - w) * prior


def bloc_totals(sh: dict[str, float], lists: dict[str, dict]) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in sh.items():
        b = lists.get(k, {}).get("bloc", "none")
        out[b] = out.get(b, 0) + v
    return out


def apply_ratio(sh: dict[str, float], factor: dict[str, float]) -> dict[str, float]:
    """מכפיל כל רשימה בפקטור שלה ומנרמל חזרה לאותו סכום (כך נשמר סך הקולות)."""
    tot = sum(sh.values())
    new = {k: v * factor.get(k, 1.0) for k, v in sh.items()}
    s = sum(new.values())
    return {k: v * tot / s for k, v in new.items()} if s > 0 else sh


@dataclass
class Fitted:
    weights: dict[str, float]
    pollster_error: dict[str, float]
    bloc_bias_shared: dict[str, float]
    bloc_bias_series: dict[str, dict[str, float]]
    party_bias: dict[str, float]
    threshold_bias: float
    threshold_cases: int
    others_share: float = 0.0  # מסת הקולות לרשימות שלא הופיעו בסקרים (גרסה 2)


def correct_poll(sh: dict[str, float], series: str, lists: dict[str, dict], f: Fitted, spec: dict,
                 threshold_share: float, use: set[str]) -> dict[str, float]:
    """מחיל על סקר אחד את התיקונים שנאמדו מהעבר (ההטיה = לוג היחס בין התחזית לתוצאה; מתקנים ב-exp(−הטיה))."""
    if "bloc" in use:
        fac = {}
        for k in sh:
            b = lists.get(k, {}).get("bloc", "none")
            bias = f.bloc_bias_shared.get(b, 0.0) + f.bloc_bias_series.get(series, {}).get(b, 0.0)
            fac[k] = math.exp(-bias)
        sh = apply_ratio(sh, fac)
    if "party" in use:
        fac = {k: math.exp(-f.party_bias.get(lists.get(k, {}).get("party") or "", 0.0)) for k in sh}
        sh = apply_ratio(sh, fac)
    if "threshold" in use and f.threshold_cases >= spec["model"]["threshold"]["minCases"]:
        band = spec["model"]["threshold"]["bandPoints"] / 100
        fac = {k: math.exp(-f.threshold_bias) for k, v in sh.items() if abs(v - threshold_share) <= band}
        sh = apply_ratio(sh, fac)
    return sh


def combine(polls: dict[str, dict[str, float]], weights: dict[str, float]) -> dict[str, float]:
    keys = set().union(*[set(v) for v in polls.values()]) if polls else set()
    tw = sum(weights.get(s, 1.0) for s in polls)
    return {k: sum(weights.get(s, 1.0) * sh.get(k, 0.0) for s, sh in polls.items()) / tw for k in keys}


def fit(history: list[tuple[Election, dict[str, dict[str, float]]]], t_index: float, spec: dict) -> Fitted:
    """אומד את כל רכיבי המודל מהמערכות שקדמו לזו שנחזית. history: [(מערכת, {סדרה: אחוזים})], לפי הסדר."""
    m = spec["model"]
    strength = m["shrinkStrength"]
    eps = m["clrEpsilon"]
    min_share = spec["gate"]["unitMinShare"]
    # 1. טעות לכל סדרה בכל מערכת: 1 − דיוק הקולות (באותה הגדרה כמו השער)
    errs: dict[str, list[tuple[float, float]]] = {}
    pooled: list[tuple[float, float]] = []
    for e, polls in history:
        x = e.knesset
        for s, sh in polls.items():
            err = max(1 - vote_accuracy(sh, e.shares(), min_share), 1e-3)
            errs.setdefault(s, []).append((x, math.log(err)))
            pooled.append((x, math.log(err)))
    prior_err = _shrunk_trend(pooled, sum(y for _, y in pooled) / len(pooled), 0.0, t_index) if pooled else math.log(0.05)
    pollster_error = {s: math.exp(_shrunk_trend(pts, prior_err, strength, t_index)) for s, pts in errs.items()}
    # 2. הטיה לפי גוש: לוג היחס בין סך הגוש בסקר לסך הגוש בתוצאה. משותף (כל הסדרות) + אישי (סטייה מהמשותף)
    shared_pts: dict[str, list[tuple[float, float]]] = {}
    series_pts: dict[str, dict[str, list[tuple[float, float]]]] = {}
    for e, polls in history:
        act = bloc_totals(e.shares(), e.lists)
        per_bloc: dict[str, list[float]] = {}
        for s, sh in polls.items():
            pr = bloc_totals(sh, e.lists)
            for b in act:
                if b == "none" or act[b] <= 0 or pr.get(b, 0) <= 0:
                    continue
                d = math.log((pr[b] + eps) / (act[b] + eps))
                per_bloc.setdefault(b, []).append(d)
                series_pts.setdefault(s, {}).setdefault(b, []).append((e.knesset, d))
        for b, ds in per_bloc.items():
            shared_pts.setdefault(b, []).append((e.knesset, sum(ds) / len(ds)))
    bloc_bias_shared = {b: _shrunk_trend(pts, 0.0, strength, t_index) for b, pts in shared_pts.items()}
    bloc_bias_series = {}
    for s, bl in series_pts.items():
        bloc_bias_series[s] = {}
        for b, pts in bl.items():
            dev = [(x, y - dict(shared_pts[b]).get(x, 0.0)) for x, y in pts]
            bloc_bias_series[s][b] = _shrunk_trend(dev, 0.0, strength, t_index)
    # 3. רכיב מפלגות שממשיכות — משארית אחרי תיקון הגוש
    party_pts: dict[str, list[tuple[float, float]]] = {}
    for e, polls in history:
        sub = Fitted({}, {}, {b: dict(p).get(e.knesset, 0.0) for b, p in shared_pts.items()},
                     {s: {b: 0.0 for b in bl} for s, bl in series_pts.items()}, {}, 0.0, 0)
        corrected = {s: correct_poll(sh, s, e.lists, sub, spec, 0.0, {"bloc"}) for s, sh in polls.items()}
        avg = combine(corrected, {})
        act = e.shares()
        for k, info in e.lists.items():
            party = info.get("party")
            if party and avg.get(k, 0) > 0 and act.get(k, 0) > 0:
                party_pts.setdefault(party, []).append((e.knesset, math.log((avg[k] + eps) / (act[k] + eps))))
    party_bias = {p: _shrunk_trend(pts, 0.0, strength, t_index) for p, pts in party_pts.items()}
    # 4. רכיב סף — רשימות בטווח סביב הסף שהיה בתוקף, משארית אחרי השלבים הקודמים
    band = m["threshold"]["bandPoints"] / 100
    thr_pts: list[float] = []
    for e, polls in history:
        thr = e.threshold[0] / e.threshold[1]
        sub = Fitted({}, {}, {b: dict(p).get(e.knesset, 0.0) for b, p in shared_pts.items()}, {}, party_bias, 0.0, 0)
        corrected = {s: correct_poll(sh, s, e.lists, sub, spec, thr, {"bloc", "party"}) for s, sh in polls.items()}
        avg = combine(corrected, {})
        act = e.shares()
        for k, v in avg.items():
            if abs(v - thr) <= band and act.get(k, 0) > 0:
                thr_pts.append(math.log((v + eps) / (act[k] + eps)))
    n_thr = len(thr_pts)
    thr_bias = (sum(thr_pts) / n_thr) * (n_thr / (n_thr + strength)) if n_thr else 0.0
    # 5. "אחרים": סקרים אינם מציגים רשימות מתחת לסף, ולכן מסתן חסרה באופן מבני. ממוצע (בלי כיווץ לאפס — ידוע שהיא חיובית)
    #    של 1 − סך הקולות בפועל של הרשימות שהופיעו בסקרי אותה מערכת
    oth = []
    for e, polls in history:
        named = {k for sh in polls.values() for k, v in sh.items() if v > 0}
        act = e.shares()
        oth.append(max(0.0, 1 - sum(act.get(k, 0.0) for k in named)))
    others = sum(oth) / len(oth) if oth else 0.0
    # 6. משקלים: נגזרים מ-pollster_error ב-weights_for
    return Fitted({}, pollster_error, bloc_bias_shared, bloc_bias_series, party_bias, thr_bias, n_thr, others)


def weights_for(series: list[str], f: Fitted, spec: dict) -> dict[str, float]:
    m = spec["model"]["weights"]
    if not series:
        return {}
    known = [f.pollster_error[s] for s in series if s in f.pollster_error]
    pooled = median(known) if known else 1.0
    raw = {}
    for s in series:
        err = f.pollster_error.get(s, pooled)
        rel = (pooled / err) ** 2
        raw[s] = min(max(rel, m["minRelative"]), m["maxRelative"])
    tot = sum(raw.values())
    w = {s: v / tot for s, v in raw.items()}
    cap = m["maxShare"]
    for _ in range(10):  # תקרה: מה שמעליה מתחלק בין השאר באופן יחסי
        over = {s: v for s, v in w.items() if v > cap}
        if not over or len(w) * cap < 1:
            break
        excess = sum(v - cap for v in over.values())
        rest = {s: v for s, v in w.items() if s not in over}
        rt = sum(rest.values())
        w = {s: (cap if s in over else v + excess * v / rt) for s, v in w.items()}
    return w


# ---------------------------------------------------------------- תחזית ובדיקת עבר

VARIANTS = ("V0", "V1", "V2", "V3", "V4")


def forecast(variant: str, polls: dict[str, dict[str, float]], lists: dict[str, dict], f: Fitted | None,
             spec: dict, threshold: tuple[int, int], agreements: list[tuple[str, str]]) -> tuple[dict[str, float], dict[str, int]]:
    thr_share = threshold[0] / threshold[1]
    if variant == "V0" or f is None:
        keys = set().union(*[set(v) for v in polls.values()])
        med = {k: median([sh.get(k, 0.0) for sh in polls.values()]) for k in keys}
        tot = sum(med.values())
        sh = {k: v / tot for k, v in med.items()}
    else:
        use = {"V1": {"bloc_shared"}, "V2": {"bloc", "party"}, "V3": {"bloc", "party", "threshold"}}[variant]
        if variant == "V1":
            f1 = Fitted({}, {}, f.bloc_bias_shared, {}, {}, 0.0, 0)
            corrected = {s: correct_poll(p, s, lists, f1, spec, thr_share, {"bloc"}) for s, p in polls.items()}
            sh = combine(corrected, {})
        else:
            corrected = {s: correct_poll(p, s, lists, f, spec, thr_share, use) for s, p in polls.items()}
            sh = combine(corrected, weights_for(list(polls), f, spec))
            if variant in spec["model"].get("others", {}).get("variants", []):
                # מחליף את השארית שמודל התצפית השאיר (1%–5%, לא מכויל) במסה שנאמדה מהעבר
                tot = sum(sh.values())
                sh = {k: v / tot * (1 - f.others_share) for k, v in sh.items()}
    return sh, seats_from_shares(sh, agreements, threshold)


def median_shares(polls: dict[str, dict[str, float]]) -> dict[str, float]:
    keys = set().union(*[set(v) for v in polls.values()]) if polls else set()
    med = {k: median([sh.get(k, 0.0) for sh in polls.values()]) for k in keys}
    tot = sum(med.values())
    return {k: v / tot for k, v in med.items()} if tot > 0 else {}


def momentum(now: dict[str, dict[str, float]], before: dict[str, dict[str, float]], min_series: int) -> dict[str, float]:
    """התנועה בין החלון הקודם לחלון האחרון (חציון מנורמל בכל אחד). פחות מ-min_series סדרות באחד מהם ⇐ אין מגמה."""
    if len(now) < min_series or len(before) < min_series:
        return {}
    a, b = median_shares(now), median_shares(before)
    return {k: a.get(k, 0.0) - b.get(k, 0.0) for k in set(a) | set(b)}


def fit_momentum(history: list[tuple[Election, dict[str, dict[str, float]], dict[str, float]]], spec: dict) -> tuple[float, int]:
    """מקדם ההמשכה β: כמה מהתנועה האחרונה המשיכה עד יום הבחירות בעבר. ריבועים פחותים דרך הראשית של
    (תוצאה − חציון החלון האחרון) על התנועה, ברשימות שמעל סף היחידה; מכווץ ל-0 ב-n/(n+חוזק), n = מספר המערכות."""
    min_share = spec["gate"]["unitMinShare"]
    sxy = sxx = 0.0
    n = 0
    for e, polls, mom in history:
        if not mom:
            continue
        n += 1
        med = median_shares(polls)
        act = e.shares()
        for k in units(med, act, min_share):
            m = mom.get(k, 0.0)
            sxy += (act.get(k, 0.0) - med.get(k, 0.0)) * m
            sxx += m * m
    if n == 0 or sxx == 0:
        return 0.0, n
    lo, hi = spec["model"]["momentum"]["betaRange"]
    beta = min(max(sxy / sxx, lo), hi)
    return beta * n / (n + spec["model"]["shrinkStrength"]), n


def apply_momentum(sh: dict[str, float], mom: dict[str, float], beta: float) -> dict[str, float]:
    tot = sum(sh.values())
    new = {k: max(0.0, v + beta * mom.get(k, 0.0)) for k, v in sh.items()}
    s2 = sum(new.values())
    return {k: v * tot / s2 for k, v in new.items()} if s2 > 0 else sh


def run_backtest(spec: dict, horizon: int) -> dict:
    elections = load_elections(spec)
    polls = load_polls(spec)
    seed = spec["model"]["seed"]
    order = sorted(elections)
    obs: dict[int, dict[str, dict[str, float]]] = {}
    moms: dict[int, dict[str, float]] = {}
    validity: dict[int, dict] = {}
    for k in order:
        e = elections[k]
        fw = final_week(polls, e, spec, horizon)
        obs[k] = {p.series: poll_shares(p, list(e.votes), e.agreements, e.threshold, seed) for p in fw}
        obs[k] = {s: sh for s, sh in obs[k].items() if sh}
        prev = final_week(polls, e, spec, horizon + spec["model"]["momentum"]["lagDays"])
        prev_obs = {p.series: poll_shares(p, list(e.votes), e.agreements, e.threshold, seed) for p in prev}
        moms[k] = momentum(obs[k], {s: sh for s, sh in prev_obs.items() if sh}, spec["model"]["momentum"]["minSeries"])
        n = len(obs[k])
        validity[k] = {"series": n, "valid": n >= spec["validity"]["minSeries"]}
    rows = []
    for i, k in enumerate(order):
        e = elections[k]
        if not validity[k]["valid"]:
            continue
        hist = [(elections[j], obs[j]) for j in order[:i] if validity[j]["valid"]]
        f = fit(hist, k, spec) if hist else None
        row = {"knesset": k, "date": e.date, "series": sorted(obs[k]), "trainedOn": [h[0].knesset for h in hist],
               "coldStart": not hist, "variants": {}}
        beta, n_mom = fit_momentum([(elections[j], obs[j], moms[j]) for j in order[:i] if validity[j]["valid"]], spec)
        row["momentum"] = {"beta": round(beta, 4), "elections": n_mom, "available": bool(moms[k])}
        for v in VARIANTS:
            if v == "V4":
                sh3, _ = forecast("V3", obs[k], e.lists, f, spec, e.threshold, e.agreements)
                sh = apply_momentum(sh3, moms[k], beta) if f is not None else sh3
                se = seats_from_shares(sh, e.agreements, e.threshold)
            else:
                sh, se = forecast(v, obs[k], e.lists, f, spec, e.threshold, e.agreements)
            row["variants"][v] = {
                "voteAccuracy": round(vote_accuracy(sh, e.shares(), spec["gate"]["unitMinShare"]), 5),
                "seatAccuracy": round(seat_accuracy(se, e.seats), 5),
                "seats": {k2: v2 for k2, v2 in se.items() if v2},
                "shares": {k2: round(v2, 6) for k2, v2 in sh.items() if v2 > 0},
            }
        if f is not None:
            row["weights"] = {s: round(w, 4) for s, w in weights_for(sorted(obs[k]), f, spec).items()}
        rows.append(row)
    gate_set = spec["gate"]["elections"]
    gate_rows = [r for r in rows if r["knesset"] in gate_set]
    valid_run = all(validity[k]["valid"] for k in gate_set)
    summary = {}
    for v in VARIANTS:
        if len(gate_rows) == len(gate_set):
            summary[v] = {
                "voteAccuracy": sum(r["variants"][v]["voteAccuracy"] for r in gate_rows) / len(gate_rows),
                "seatAccuracy": sum(r["variants"][v]["seatAccuracy"] for r in gate_rows) / len(gate_rows),
            }
    primary = spec["gate"]["primaryVariant"]
    passed = False
    if valid_run and primary in summary:
        g = spec["gate"]
        s, b = summary[primary], summary["V0"]
        passed = (s["voteAccuracy"] >= g["minVoteAccuracy"] and s["seatAccuracy"] >= g["minSeatAccuracy"]
                  and s["seatAccuracy"] >= b["seatAccuracy"])
    return {"horizon": horizon, "rows": rows, "validity": {str(k): v for k, v in validity.items()}, "valid": valid_run,
            "summary": summary, "passed": passed}


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def log_run(out: dict, spec: dict) -> dict:
    """שורה ביומן ההרצות (pipeline/forecast_runs.jsonl) — רק מוסיפים, לא משנים. הקומיט = הקומיט שלפני השורה."""
    import subprocess
    from datetime import datetime, timezone
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain", "pipeline/forecast.py", "pipeline/forecast_spec.json",
                                 "raw/forecast/polls.json"], capture_output=True, text=True, cwd=ROOT).stdout.strip())
    row = {"runAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "commit": commit, "dirty": dirty,
           "specVersion": spec["version"], "specSha": file_sha(SPEC_PATH), "codeSha": file_sha(Path(__file__)),
           "dataSha": file_sha(RAW / "forecast" / "polls.json"), "horizon": out["horizon"], "valid": out["valid"],
           "passed": out["passed"], "summary": out["summary"],
           "perElection": {str(r["knesset"]): {v: [r["variants"][v]["voteAccuracy"], r["variants"][v]["seatAccuracy"]]
                                               for v in VARIANTS} for r in out["rows"]}}
    with (Path(__file__).resolve().parent / "forecast_runs.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    return row


if __name__ == "__main__":
    import sys
    sp = load_spec()
    hs = [int(a) for a in sys.argv[1:] if a.isdigit()]
    for h in (hs or sp["data"]["horizons"]):
        out = run_backtest(sp, h)
        if "--log" in sys.argv:
            log_run(out, sp)
        print(json.dumps({"horizon": h, "valid": out["valid"], "passed": out["passed"], "summary": out["summary"],
                          "perElection": [(r["knesset"], {v: (r["variants"][v]["voteAccuracy"], r["variants"][v]["seatAccuracy"])
                                                          for v in VARIANTS}) for r in out["rows"]]},
                         ensure_ascii=False, indent=1))
