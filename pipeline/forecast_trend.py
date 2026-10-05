"""מודל החיזוי, גרסה 5 — מודל המגמות (הכרעת בעלים, 5.10.2026).

אותו מודל בכל מערכת; רק המספרים נאמדים, תמיד מהמערכות שקדמו לה, ובאותו מרחק מהבחירות (d ימים):
1. לכל מכון — כל הסקרים שלו מהגשת הרשימות ועד d ימים לפני הבחירות.
2. קו מגמה לכל רשימה, וממשיכים אותו עד יום הבחירות. בעבר: כמה מהמגמה התממשה בפועל (מקדם המשכה β — לכל מכון,
   מכווץ לכיוון המשותף), וכמה רחוקה הנקודה מהתוצאה.
3. השיפור של כל מכון ממערכת למערכת — מגמת הטעות שלו לאורך המערכות (כמו בגרסאות הקודמות, forecast.fit).
4. ההערכה של כל מכון = קו המגמה של היום, מתוקן לפי ההטיות שנמדדו (גוש, מפלגה, סף), ומשוקלל לפי הדיוק הצפוי ⇐ A.
5. אותו תהליך בדיוק על כל הסקרים יחד, כאילו היו מכון אחד ⇐ B. התחזית = שקלול A ו-B לפי הדיוק שלהם בעבר
   (גם כאן — עם מגמת שיפור).
גרסאות לדיווח: V0 (חציון הסקר האחרון של כל מכון בשבוע האחרון — קו הבסיס), V5A, V5B, V5 (הראשית).
"""
from __future__ import annotations

import math
from datetime import date

import forecast as F

POOLED = "__all__"
VARIANTS = ("V0", "V5A", "V5B", "V5")
_SHARES: dict[str, dict[str, float]] = {}


def shares_of(p: F.Poll, e: F.Election, seed: int) -> dict[str, float]:
    """האחוזים של סקר (מודל התצפית) — מחושבים פעם אחת לכל סקר."""
    if p.id not in _SHARES:
        _SHARES[p.id] = F.poll_shares(p, list(e.votes), e.agreements, e.threshold, seed)
    return _SHARES[p.id]


def campaign(polls: list[F.Poll], e: F.Election, start: str, horizon: int, seed: int) -> dict[str, list[tuple[int, dict[str, float]]]]:
    """לכל סדרה: [(ימים לפני הבחירות, אחוזים)] — כל הסקרים מהגשת הרשימות ועד horizon ימים לפני הבחירות."""
    eday = date.fromisoformat(e.date)
    out: dict[str, list[tuple[int, dict[str, float]]]] = {}
    for p in polls:
        if p.knesset != e.knesset or not p.field_end or p.field_end <= start:
            continue
        d = (eday - date.fromisoformat(p.field_end)).days
        if d < horizon:
            continue
        sh = shares_of(p, e, seed)
        if sh:
            out.setdefault(p.series, []).append((d, sh))
    return out


def trend(points: list[tuple[int, dict[str, float]]], horizon: int, strength: float) -> tuple[dict[str, float], dict[str, float]]:
    """קו מגמה לכל רשימה (ריבועים פחותים על הזמן). מחזיר (הרמה ביום החיתוך, השינוי הצפוי מהחיתוך ועד יום הבחירות
    אילו המגמה נמשכת במלואה). השיפוע מכווץ לאפס ב-(n−1)/(n−1+strength) — סדרה עם סקר אחד היא רמה בלבד."""
    n = len(points)
    keys = set().union(*[set(sh) for _, sh in points])
    xs = [-d for d, _ in points]
    mx = sum(xs) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    level, move = {}, {}
    for k in keys:
        ys = [sh.get(k, 0.0) for _, sh in points]
        my = sum(ys) / n
        b = (sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx) if n >= 2 and sxx > 0 else 0.0
        b *= (n - 1) / (n - 1 + strength)
        level[k] = max(0.0, my + b * (-horizon - mx))
        move[k] = b * horizon
    return level, move


def project(level: dict[str, float], move: dict[str, float], beta: float) -> dict[str, float]:
    """הנקודה ביום הבחירות: הרמה + β × המגמה; לא שלילי; סך האחוזים נשמר."""
    tot = sum(level.values())
    p = {k: max(0.0, v + beta * move.get(k, 0.0)) for k, v in level.items()}
    s = sum(p.values())
    return {k: v * tot / s for k, v in p.items()} if s > 0 else level


def fit_beta(past: list[tuple[F.Election, dict[str, tuple[dict, dict]]]], spec: dict) -> tuple[float, dict[str, float]]:
    """מקדם ההמשכה: כמה מהמגמה של כל מכון התממשה עד יום הבחירות. משותף — ריבועים פחותים דרך הראשית של
    (תוצאה − רמה) על המגמה, קטום, מכווץ ל-0 ב-n/(n+חוזק) (n = מערכות). לכל מכון — אותו אומדן על הסדרה שלו,
    מכווץ לכיוון המשותף ב-n_s/(n_s+חוזק)."""
    m = spec["model"]
    lo, hi = m["trend"]["betaRange"]
    strength = m["shrinkStrength"]
    min_share = spec["gate"]["unitMinShare"]

    def est(pairs: list[tuple[float, float]]) -> float | None:
        sxx = sum(mv * mv for _, mv in pairs)
        return min(max(sum(r * mv for r, mv in pairs) / sxx, lo), hi) if sxx > 0 else None

    pooled_pairs, by_series, n_el, n_s = [], {}, 0, {}
    for e, series in past:
        act = e.shares()
        used = False
        for s, (level, move) in series.items():
            pts = [(act.get(k, 0.0) - level.get(k, 0.0), move.get(k, 0.0)) for k in F.units(level, act, min_share)]
            if any(mv for _, mv in pts):
                pooled_pairs += pts
                by_series.setdefault(s, []).extend(pts)
                n_s[s] = n_s.get(s, 0) + 1
                used = True
        n_el += used
    b0 = est(pooled_pairs)
    pooled = (b0 or 0.0) * n_el / (n_el + strength)
    per = {}
    for s, pairs in by_series.items():
        bs = est(pairs)
        w = n_s[s] / (n_s[s] + strength)
        per[s] = w * (bs if bs is not None else pooled) + (1 - w) * pooled
    return pooled, per


def predicted_error(history: list[tuple[int, float]], t: float, strength: float) -> float | None:
    """הטעות הצפויה במערכת t, ממגמת הטעויות בעבר (לוג; אותה פונקציה כמו לשיפור המכונים)."""
    if not history:
        return None
    pts = [(x, math.log(max(err, 1e-3))) for x, err in history]
    prior = sum(y for _, y in pts) / len(pts)
    return math.exp(F._shrunk_trend(pts, prior, strength, t))


class Backtest:
    """בדיקת העבר באופק אחד. מחשב לפי הסדר: לכל מערכת — A ו-B מתוך המערכות הקודמות בלבד, ואז השקלול ביניהם
    לפי הדיוק של A ו-B במערכות הקודמות."""

    def __init__(self, spec: dict, horizon: int):
        self.spec, self.h = spec, horizon
        self.seed = spec["model"]["seed"]
        self.elections = F.load_elections(spec)
        self.polls = F.load_polls(spec)
        self.order = sorted(self.elections)
        self.strength_trend = spec["model"]["trend"]["slopeStrength"]
        self.camp = {k: campaign(self.polls, self.elections[k], spec["elections"][str(k)]["listSubmission"], horizon, self.seed)
                     for k in self.order}
        self.lines = {k: {s: trend(pts, horizon, self.strength_trend) for s, pts in c.items()} for k, c in self.camp.items()}
        self.pooled_lines = {k: trend([pt for pts in c.values() for pt in pts], horizon, self.strength_trend) if c else None
                             for k, c in self.camp.items()}
        self.validity = {k: {"series": len(self.camp[k]), "valid": len(self.camp[k]) >= spec["validity"]["minSeries"]}
                         for k in self.order}

    def estimate(self, k: int, lines: dict, pooled_line, lists: dict, thr: tuple[int, int], agreements, past_keys: list[int]):
        """A, B והפרמטרים — לתחזית במערכת k (או 26), מתוך המערכות past_keys בלבד."""
        spec = self.spec
        past = [self.elections[j] for j in past_keys]
        beta0, beta_s = fit_beta([(e, self.lines[e.knesset]) for e in past], spec)
        betaP, _ = fit_beta([(e, {POOLED: self.pooled_lines[e.knesset]}) for e in past if self.pooled_lines[e.knesset]], spec)
        hist_A = [(e, {s: project(lv, mv, beta_s.get(s, beta0)) for s, (lv, mv) in self.lines[e.knesset].items()}) for e in past]
        hist_B = [(e, {POOLED: project(*self.pooled_lines[e.knesset], betaP)}) for e in past if self.pooled_lines[e.knesset]]
        thr_share = thr[0] / thr[1]
        use = {"bloc", "party", "threshold"}
        cur_A = {s: project(lv, mv, beta_s.get(s, beta0)) for s, (lv, mv) in lines.items()}
        if hist_A:
            fA = F.fit(hist_A, k, spec)
            corr = {s: F.correct_poll(sh, s, lists, fA, spec, thr_share, use) for s, sh in cur_A.items()}
            A = F.combine(corr, F.weights_for(sorted(cur_A), fA, spec))
            weights = F.weights_for(sorted(cur_A), fA, spec)
        else:
            fA, A, weights = None, F.combine(cur_A, {}), {}
        B = project(*pooled_line, betaP)
        if hist_B:
            fB = F.fit(hist_B, k, spec)
            B = F.correct_poll(B, POOLED, lists, fB, spec, thr_share, use)
        else:
            fB = None
        others = fA.others_share if fA else 0.0
        norm = lambda sh: {kk: v / sum(sh.values()) * (1 - others) for kk, v in sh.items()} if sh else sh
        return norm(A), norm(B), {"beta": beta0, "betaPooled": betaP, "betaSeries": beta_s, "weights": weights, "others": others}

    def run(self) -> dict:
        spec = self.spec
        rows, errs = [], {"A": [], "B": []}
        for i, k in enumerate(self.order):
            e = self.elections[k]
            if not self.validity[k]["valid"]:
                continue
            past_keys = [j for j in self.order[:i] if self.validity[j]["valid"]]
            A, B, par = self.estimate(k, self.lines[k], self.pooled_lines[k], e.lists, e.threshold, e.agreements, past_keys)
            wA = self.combo_weight(errs, k)
            final = {kk: wA * A.get(kk, 0.0) + (1 - wA) * B.get(kk, 0.0) for kk in set(A) | set(B)}
            fw = F.final_week(self.polls, e, spec, self.h)
            obs = {p.series: shares_of(p, e, self.seed) for p in fw}
            obs = {s: v for s, v in obs.items() if v}
            v0 = F.forecast("V0", obs, e.lists, None, spec, e.threshold, e.agreements)[0] if obs else {}
            act = e.shares()
            mu = spec["gate"]["unitMinShare"]
            row = {"knesset": k, "date": e.date, "series": sorted(self.camp[k]), "trainedOn": past_keys, "coldStart": not past_keys,
                   "combo": {"wA": round(wA, 4)}, "beta": round(par["beta"], 4), "betaPooled": round(par["betaPooled"], 4),
                   "variants": {}}
            for v, sh in (("V0", v0), ("V5A", A), ("V5B", B), ("V5", final)):
                se = F.seats_from_shares(sh, e.agreements, e.threshold) if sh else {}
                row["variants"][v] = {"voteAccuracy": round(F.vote_accuracy(sh, act, mu), 5) if sh else 0.0,
                                      "seatAccuracy": round(F.seat_accuracy(se, e.seats), 5) if sh else 0.0,
                                      "seats": {a: b for a, b in se.items() if b},
                                      "shares": {a: round(b, 6) for a, b in sh.items() if b > 0}}
            errs["A"].append((k, 1 - row["variants"]["V5A"]["voteAccuracy"]))
            errs["B"].append((k, 1 - row["variants"]["V5B"]["voteAccuracy"]))
            rows.append(row)
        return F.summarize_backtest(spec, self.h, rows, self.validity, VARIANTS)

    def combo_weight(self, errs: dict, t: int) -> float:
        """המשקל של A מול B: 1/טעות² לפי הטעות הצפויה של כל אחד (מגמת הטעויות שלו במערכות הקודמות)."""
        s = self.spec["model"]["shrinkStrength"]
        ea, eb = predicted_error(errs["A"], t, s), predicted_error(errs["B"], t, s)
        if ea is None or eb is None:
            return 0.5
        return (1 / ea ** 2) / (1 / ea ** 2 + 1 / eb ** 2)


def run_backtest(spec: dict, horizon: int) -> dict:
    return Backtest(spec, horizon).run()
