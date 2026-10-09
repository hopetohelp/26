"""מודל החיזוי — התחזית החיה לכנסת ה-26 (src/data/forecast.json), ונתוני הגילוי הנאות מיומן ההרצות.

אותו מודל בדיוק כמו בבדיקת העבר (forecast.py, המפרט הנוכחי): הפרמטרים נאמדים מכל המערכות 2013–2022 באופק המתאים
למרחק מהבחירות, והסקרים הם הסקר האחרון של כל סדרה בשבוע שמסתיים ביום הבנייה. נקרא מ-build_data.py.

הטווח: תרחישים — לכל רשימה טעות בלוג-יחס, לפי שאריות המודל עצמו בבדיקת העבר באותו אופק (רשימות קטנות וגדולות
בנפרד), מוגדלת ב-inflation, מהתפלגות t עם df דרגות חופש (זנבות עבים: החטאות כמו 2015 ו-2019א).
"""
from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

import forecast as F
import forecast_challenger as C
import model as M

HERE = Path(__file__).resolve().parent
K26 = json.loads((HERE / "forecast_k26.json").read_text(encoding="utf-8"))
SCENARIOS = {"n": 10000, "inflation": 1.25, "df": 4, "smallShare": 0.05}


def horizon_for(days: int, spec: dict) -> int:
    """האופק המדויק: מספר הימים עד הבחירות (הכרעת בעלים — ההשוואה לעבר באותו מרחק בדיוק). מתחת ל-4 — 4 (סקר אחרון
    ביום שישי); מעל המרחק שהנתונים המאומתים מכסים — הגבול הזה."""
    hs = spec["data"]["horizons"]
    return min(max(days, min(hs)), max(hs))


def log_rows() -> list[dict]:
    path = HERE / "forecast_runs.jsonl"
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()] if path.exists() else []


def residual_sd(bt: dict, spec: dict, weight: float | None = None) -> dict[str, float]:
    """שורש ממוצע ריבועי השאריות של הגרסה הראשית, במערכות שאינן התחלה קרה. רשימה גדולה — בלוג-יחס (הטעות יחסית
    לגודל); רשימה קטנה (מתחת ל-smallShare בתחזית) — בנקודות אחוז, כי לוג-יחס של רשימה שקרסה לאפס מתפוצץ."""
    eps = spec["model"]["clrEpsilon"]
    v = spec["gate"]["primaryVariant"]
    elections = F.load_elections(spec)
    small, large = [], []
    for r in bt["rows"]:
        if r["coldStart"]:
            continue
        pred = (r["variants"][v]["shares"] if weight is None
                else C.mix(r["variants"]["V0"]["shares"], r["variants"][v]["shares"], weight))
        if not pred:
            continue
        act = elections[r["knesset"]].shares()
        for k in F.units(pred, act, spec["gate"]["unitMinShare"]):
            if pred.get(k, 0) < SCENARIOS["smallShare"]:
                small.append(act.get(k, 0) - pred.get(k, 0))
            else:
                large.append(math.log((act.get(k, 0) + eps) / (pred.get(k, 0) + eps)))
    rms = lambda xs: math.sqrt(sum(x * x for x in xs) / len(xs)) if xs else 0.0
    return {"small": rms(small), "large": rms(large), "nSmall": len(small), "nLarge": len(large)}


def t_draw(rng: random.Random, df: int) -> float:
    """t עם df דרגות חופש, מנורמל לסטיית תקן 1."""
    z = rng.gauss(0, 1)
    chi = sum(rng.gauss(0, 1) ** 2 for _ in range(df))
    return z / math.sqrt(chi / df) / math.sqrt(df / (df - 2))


def build(polls: list[dict], series_of, pairs: list[tuple[str, str]], gov: list[str], build_day: date) -> dict:
    spec = F.load_spec()
    seed = spec["model"]["seed"]
    eday = date.fromisoformat(K26["date"])
    days = (eday - build_day).days
    h = horizon_for(days, spec)
    thr = tuple(K26["threshold"])
    lists = K26["lists"]
    win = spec["data"]["windowDays"]
    lag = spec["model"]["momentum"]["lagDays"]

    def window(end: date) -> dict[str, dict[str, float]]:
        last: dict[str, dict] = {}
        for p in polls:
            fe = date.fromisoformat(p["end"])
            s = series_of(p["firm"])
            if end - timedelta(days=win) < fe <= end and (s not in last or p["end"] > last[s]["end"]):
                last[s] = p
        out = {}
        for s, p in last.items():
            vals = {k: v for k, v in p["values"].items() if k in lists}
            sh = F.poll_shares(F.Poll(p["id"], 26, s, p["end"], vals), list(lists), pairs, thr, seed)
            if sh:
                out[s] = sh
        return out

    primary = spec["gate"]["primaryVariant"]
    if spec["model"].get("kind") == "trend":
        sh, bt, info = build_trend(polls, series_of, pairs, thr, lists, spec, h, days, eday, build_day, seed)
        now, before, enough = info["series"], [], info["enough"]
    else:
        sh, bt, info, now, before, enough = build_v4(polls, window, lists, thr, pairs, spec, h, lag, build_day, seed, primary)
    # שומר "לא גרוע מממוצע הסקרים" (הכרעת בעלים 8.10.2026): המרכז הציבורי נבחר בין חציון הסקרים (V0), המגמות (V5)
    # ושילוב חצי־חצי — לפי דיוק המנדטים בבדיקת העבר באותו אופק בדיוק, רק במערכות שכבר נבדקו (forecast_challenger.choose).
    # בהתחלה ובשוויון — החציון. כך התחזית אינה מאמצת מודל שהפסיד לחציון בעבר.
    selection = None
    if sh and spec["model"].get("kind") == "trend":
        base = F.forecast("V0", window(build_day), lists, None, spec, thr, pairs)[0] if window(build_day) else {}
        ev = C.evaluate(bt, spec, F.load_elections(spec))
        history = [{k: v for k, v in r["scores"].items() if k != "adaptive"} for r in ev["rows"]]
        chosen = C.choose(history) if base else "trend"
        weight = C.CANDIDATES[chosen]
        sh = C.mix(base, sh, weight) if base else sh
        selection = {"candidate": chosen, "weight": weight, "trainedOn": [r["knesset"] for r in ev["rows"]],
                     "summary": {k: {m: round(v, 5) for m, v in x.items()} for k, x in ev["summary"].items()}}
    central = F.seats_from_shares(sh, pairs, thr) if sh else {}

    # תרחישים — לפי השאריות של המרכז שנבחר בפועל
    sd = residual_sd(bt, spec, selection["weight"] if selection else None)
    rng = random.Random(f"{seed}|live|{build_day.isoformat()}")
    names = [k for k in lists if sh.get(k, 0) > 0]
    idx = {k: i for i, k in enumerate(names)}
    pidx = [(idx[a], idx[b]) for a, b in pairs if a in idx and b in idx]
    tot = sum(sh.values())
    seat_draws = {k: [] for k in names}
    share_draws = {k: [] for k in names}
    bloc_draws, wasted = [], []
    # גוש נתניהו: כל הרשימות שמשויכות אליו בקובץ הכנסת ה-26 (מפלגות הממשלה היוצאת ועמך ישראל)
    camp = [k for k, v in lists.items() if v.get("bloc") == "right_religious"]
    camp_draws = []
    for _ in range(SCENARIOS["n"] if sh else 0):
        x = {}
        for k in names:
            t = SCENARIOS["inflation"] * t_draw(rng, SCENARIOS["df"])
            x[k] = (max(0.0, sh[k] + t * sd["small"]) if sh[k] < SCENARIOS["smallShare"]
                    else sh[k] * math.exp(t * sd["large"]))
        norm = tot / sum(x.values())
        votes = [int(round(x[k] * norm * M.VALID)) for k in names]
        seats = M.fast_seats(votes, M.VALID, pidx, threshold=thr)
        for k in names:
            seat_draws[k].append(seats[idx[k]])
            share_draws[k].append(x[k] * norm * 100)
        bloc_draws.append(sum(seats[idx[k]] for k in gov if k in idx))
        camp_draws.append(sum(seats[idx[k]] for k in camp if k in idx))
        wasted.append(sum(x[k] * norm for k in names if seats[idx[k]] == 0) * 100 + (1 - tot) * 100)

    def q(xs: list[float], p: float) -> float:
        ys = sorted(xs)
        return ys[min(len(ys) - 1, int(p * len(ys)))]

    def mean(xs: list[float]) -> float:
        return sum(xs) / len(xs)

    out_lists = {}
    for k in names:
        # seatsMean = ממוצע המנדטים בכל התרחישים (הכרעת בעלים 9.10.2026, בנוסף לחציון ב-seatsRange[1]); סכום הממוצעים של כל הרשימות = 120
        out_lists[k] = {"share": round(sh[k] * 100, 2), "seats": central.get(k, 0),
                        "seatsMean": round(mean(seat_draws[k]), 2),
                        "seatsRange": [q(seat_draws[k], 0.1), q(seat_draws[k], 0.5), q(seat_draws[k], 0.9)],
                        "shareRange": [round(q(share_draws[k], 0.1), 2), round(q(share_draws[k], 0.9), 2)],
                        "pass": round(sum(1 for s in seat_draws[k] if s > 0) / len(seat_draws[k]), 4)}

    # הגילוי הנאות: אותה בדיקת עבר בדיוק באופק של היום (bt), ויומן הניסיונות. "logged" = ההרצה הרשמית ביומן זהה לה
    rows = log_rows()
    logged = [r for r in rows if r["specVersion"] == spec["version"] and r["horizon"] == h and r["summary"] == bt["summary"]]
    at_h = {"passed": bt["passed"], "valid": bt["valid"], "logged": bool(logged),
            "invalidElections": [int(k) for k, v in bt["validity"].items() if not v["valid"] and int(k) in spec["gate"]["elections"]],
            "summary": {v: bt["summary"][v] for v in ("V0", primary) if v in bt["summary"]},
            "perElection": {str(r["knesset"]): [r["variants"][primary]["voteAccuracy"], r["variants"][primary]["seatAccuracy"]]
                            for r in bt["rows"]}}
    attempts = sorted({r["specVersion"] for r in rows})
    best = max((r["summary"].get(F_primary(r), {}).get("voteAccuracy", 0) for r in rows), default=0)
    return {
        "asof": build_day.isoformat(), "electionDay": K26["date"], "daysToElection": days, "horizon": h,
        "specVersion": spec["version"], "variant": primary, "selection": selection,
        "series": sorted(now), "seriesBefore": sorted(before), "enough": enough,
        "params": {"others": round(info["others"] * 100, 2), "beta": round(info["beta"], 4), "betaElections": info["betaElections"],
                   "trainedOn": info["trainedOn"], "residualSd": {k: round(v, 4) if isinstance(v, float) else v for k, v in sd.items()},
                   "weights": {s: round(w, 4) for s, w in info["weights"].items()}, "wA": round(info["wA"], 4) if info.get("wA") is not None else None,
                   "polls": info.get("polls"), "scenarios": SCENARIOS},
        "lists": out_lists,
        "bloc": {"lists": gov, "seats": [q(bloc_draws, 0.1), q(bloc_draws, 0.5), q(bloc_draws, 0.9)] if bloc_draws else [],
                 "mean": round(mean(bloc_draws), 2) if bloc_draws else None,
                 "atLeast61": round(sum(1 for b in bloc_draws if b >= 61) / len(bloc_draws), 4) if bloc_draws else None,
                 "central": sum(central.get(k, 0) for k in gov)},
        "camp": {"lists": camp, "seats": [q(camp_draws, 0.1), q(camp_draws, 0.5), q(camp_draws, 0.9)] if camp_draws else [],
                 "mean": round(mean(camp_draws), 2) if camp_draws else None,
                 "atLeast61": round(sum(1 for b in camp_draws if b >= 61) / len(camp_draws), 4) if camp_draws else None,
                 "central": sum(central.get(k, 0) for k in camp)},
        "wasted": [round(q(wasted, 0.1), 2), round(q(wasted, 0.5), 2), round(q(wasted, 0.9), 2)] if wasted else [],
        "gate": {"elections": spec["gate"]["elections"], "minVote": spec["gate"]["minVoteAccuracy"],
                 "minSeat": spec["gate"]["minSeatAccuracy"], "atHorizon": at_h, "passedAtHorizon": bt["passed"]},
        "attempts": {"versions": attempts, "runs": len(rows), "bestVoteAccuracy": round(best, 5)},
    }


def F_primary(row: dict) -> str:
    """הגרסה הראשית של שורה ביומן: V5 מגרסה 5, V4 בגרסה 4, V3 לפני כן."""
    return "V5" if row["specVersion"] >= 5 else "V4" if row["specVersion"] >= 4 else "V3"


def build_v4(polls, window, lists, thr, pairs, spec, h, lag, build_day, seed, primary):
    """גרסאות 1–4: הסקר האחרון של כל מכון בשבוע האחרון (נשמר כדי שהרצות היומן הישנות יהיו ניתנות לשחזור)."""
    now, before = window(build_day), window(build_day - timedelta(days=lag))
    # הפרמטרים: מכל המערכות התקפות באופק h (אותה פונקציה כמו בבדיקת העבר; t = 26)
    bt = F.run_backtest(spec, h)
    elections = F.load_elections(spec)
    hist = []
    for k in sorted(elections):
        if bt["validity"][str(k)]["valid"]:
            e = elections[k]
            fw = F.final_week(F.load_polls(spec), e, spec, h)
            obs = {p.series: F.poll_shares(p, list(e.votes), e.agreements, e.threshold, seed) for p in fw}
            prev = F.final_week(F.load_polls(spec), e, spec, h + lag)
            pobs = {p.series: F.poll_shares(p, list(e.votes), e.agreements, e.threshold, seed) for p in prev}
            obs = {s: v for s, v in obs.items() if v}
            hist.append((e, obs, F.momentum(obs, {s: v for s, v in pobs.items() if v}, spec["model"]["momentum"]["minSeries"])))
    f = F.fit([(e, o) for e, o, _ in hist], 26, spec)
    beta, n_mom = F.fit_momentum(hist, spec)
    mom = F.momentum(now, before, spec["model"]["momentum"]["minSeries"])
    enough = len(now) >= spec["validity"]["minSeries"]
    primary = spec["gate"]["primaryVariant"]
    sh = {}
    if enough:
        sh3, _ = F.forecast("V3", now, lists, f, spec, thr, pairs)
        sh = F.apply_momentum(sh3, mom, beta) if primary == "V4" else sh3
    info = {"others": f.others_share, "beta": beta, "betaElections": n_mom, "trainedOn": [e.knesset for e, _, _ in hist],
            "weights": F.weights_for(sorted(now), f, spec)}
    return sh, bt, info, now, before, enough


def build_trend(polls, series_of, pairs, thr, lists, spec, h, days, eday, build_day, seed):
    """גרסה 5 ואילך — מודל המגמות: כל הסקרים של כל מכון מאז הגשת הרשימות; הפרמטרים מבדיקת העבר באופק h."""
    import forecast_trend as T
    btobj = T.Backtest(spec, h)
    bt = btobj.run()
    camp: dict[str, list] = {}
    for p in polls:
        if date.fromisoformat(p["end"]) > build_day:
            continue
        s = series_of(p["firm"])
        vals = {k: v for k, v in p["values"].items() if k in lists}
        sh = F.poll_shares(F.Poll(p["id"], 26, s, p["end"], vals), list(lists), pairs, thr, seed)
        if sh:
            camp.setdefault(s, []).append(((eday - date.fromisoformat(p["end"])).days, sh))
    enough = len(camp) >= spec["validity"]["minSeries"]
    if not enough:
        return {}, bt, {"series": sorted(camp), "enough": False, "others": 0.0, "beta": 0.0, "betaElections": 0,
                        "trainedOn": [], "weights": {}, "wA": None}
    strength = spec["model"]["trend"]["slopeStrength"]
    at = max(days, 0)
    lines = {s: T.trend(pts, at, strength) for s, pts in camp.items()}
    pooled = T.trend([pt for pts in camp.values() for pt in pts], at, strength)
    past = [int(k) for k, v in bt["validity"].items() if v["valid"]]
    A, B, par = btobj.estimate(26, lines, pooled, lists, thr, pairs, sorted(past))
    errs = {"A": [(r["knesset"], 1 - r["variants"]["V5A"]["voteAccuracy"]) for r in bt["rows"]],
            "B": [(r["knesset"], 1 - r["variants"]["V5B"]["voteAccuracy"]) for r in bt["rows"]]}
    wA = btobj.combo_weight(errs, 26)
    sh = {k: wA * A.get(k, 0.0) + (1 - wA) * B.get(k, 0.0) for k in set(A) | set(B)}
    return sh, bt, {"series": sorted(camp), "enough": True, "others": par["others"], "beta": par["beta"],
                    "betaElections": len(past), "trainedOn": sorted(past), "weights": par["weights"], "wA": wA,
                    "polls": sum(len(v) for v in camp.values())}
