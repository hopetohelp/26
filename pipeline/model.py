"""הממוצע מבוסס-המודל ותרחישי יום הבחירות — לפי השיטה שנקבעה בתכנון האתר.

שלושה שלבים:
1. **מודל התצפית** — רוב הסקרים מפרסמים רק מנדטים, ומנדטים אינם אחוזים. לכל סקר דוגמים וקטורי קולות על הסימפלקס,
   מריצים כל אחד במנוע החוק המדויק, ומשקללים לפי המרחק בין המנדטים שהמנוע נותן לאלה שפורסמו (גרעין דועך עם זנב
   שאינו אפס). התוצאה: לכל סקר — אומדן ושונות בלוג-יחסים (log של כל רשימה ביחס לליכוד), ולא "אחוז מנוחש".
2. **הממוצע** — מודל רמה מקומית (הליכה מקרית) לכל ממד, עם אפקט בית לכל מכון+מזמין (כיווץ לאפס, וסכום האפקטים = 0
   כאילוץ זיהוי — לא אמת), במסנן קלמן ובהחלקה קדימה-אחורה.
3. **תרחישים** — שלוש שכבות אי-ודאות: אי-הוודאות של הממוצע היום · תנועה עד יום הבחירות · טעות סקרים משותפת
   כפי שנמדדה בחמש המערכות הקודמות. כל תרחיש ⇐ אחוזים ⇐ המנוע עם הסכמי העודפים ⇐ מנדטים.

הכול בפייתון סטנדרטי ובזרע קבוע — אותם נתונים ⇐ אותו פלט, בכל מחשב (בדיקת הדטרמיניזם ב-CI).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

SEATS = 120
THRESHOLD = (325, 10000)  # 3.25% מהקולות הכשרים
VALID = 5_000_000  # מספר קולות כשרים לצורך ההרצה במנוע; התוצאה תלויה רק באחוזים


# ---------------------------------------------------------------- מנוע מהיר במספרים שלמים

def fast_seats(votes: list[int], valid: int, pairs: list[tuple[int, int]], seats: int = SEATS,
               threshold: tuple[int, int] = THRESHOLD) -> list[int]:
    """אותה חלוקה כמו bader_ofer.allocate (סעיפים 81–82), במספרים שלמים בלבד — לדגימה המהירה.
    שוויון מנות (מקרה של אפס-מידה בדגימה) נשבר לפי מספר הקולות, כמו במנוע המחקרי. נבדק מולו ב-test_model.py.
    threshold: (מונה, מכנה) — 3.25% מאז 2015; 2% ב-2013 (לבדיקת העבר של מודל החיזוי)."""
    n = len(votes)
    num, den = threshold
    passing = [i for i in range(n) if votes[i] * den >= num * valid]
    pset = set(passing)
    total = sum(votes[i] for i in passing)
    out = [0] * n
    if not total:
        return out
    quota = total // seats
    act = [(a, b) for a, b in pairs if a in pset and b in pset]
    in_pair = {x for p in act for x in p}
    # יחידות לחלוקת העודפים: רשימה בודדת, או זוג הסכם עודפים כיחידה אחת
    uv, us = [], []
    members = []
    for i in passing:
        if i not in in_pair:
            uv.append(votes[i]); us.append(votes[i] // quota); members.append((i,))
    for a, b in act:
        uv.append(votes[a] + votes[b]); us.append(votes[a] // quota + votes[b] // quota); members.append((a, b))
    _dhondt(uv, us, seats, total)
    for k, mem in enumerate(members):
        if len(mem) == 1:
            out[mem[0]] = us[k]
            continue
        a, b = mem
        s = us[k]
        if s == 0:
            continue
        pq = (votes[a] + votes[b]) // s  # 82(ב): מודד הזוג
        inner_v = [votes[a], votes[b]]
        inner_s = [votes[a] // pq, votes[b] // pq]
        _dhondt(inner_v, inner_s, s, votes[a] + votes[b])
        out[a], out[b] = inner_s
    return out


def _dhondt(v: list[int], s: list[int], seats: int, total: int) -> None:
    """81(ד): כל מנדט נותר ליחידה שמנתה קולות÷(מנדטים+1) הגדולה ביותר; 81(ד)(4) — כלל הרוב. משנה את s במקום."""
    while sum(s) < seats:
        best = -1
        for k in range(len(v)):
            if 2 * v[k] <= total and 2 * s[k] >= seats:
                continue
            if best < 0:
                best = k
                continue
            lhs, rhs = v[k] * (s[best] + 1), v[best] * (s[k] + 1)
            if lhs > rhs or (lhs == rhs and v[k] > v[best]):
                best = k
        s[best] += 1


# ---------------------------------------------------------------- 1. מודל התצפית

@dataclass
class PollObs:
    """תצפית אחת: אומדן ושונות של log(רשימה / ליכוד) לכל רשימה שהסקר דיווח עליה."""
    poll_id: str
    pollster: str
    day: int  # ימים מתחילת החלון
    mean: dict[str, float]
    var: dict[str, float]
    ess: float  # גודל מדגם אפקטיבי של הדגימה; נמוך ⇐ המנוע אינו משחזר את הסקר
    wasted: float  # אומדן הקולות לרשימות שלא עברו (כולל "אחרות")
    sample: int | None = None
    share: dict[str, float] = field(default_factory=dict)  # אומדן האחוז של כל רשימה (לשונות הדגימה)


@dataclass
class ObsConfig:
    draws: int = 1500
    kernel: float = 1.5  # משקל = exp(−kernel × L1); L1 = סך הפרשי המנדטים בין המנוע לסקר
    wasted_default: tuple[float, float] = (0.019, 0.087)  # טווח "השריפה" כשלא דווח (עשירונים של 2026)
    others_default: tuple[float, float] = (0.003, 0.015)  # "אחרות" כשלא דווחו
    min_ess: float = 15.0


def observe_poll(poll_id: str, pollster: str, day: int, values: dict[str, dict], others_pct: float | None,
                 pairs: list[tuple[str, str]], ref: str, cfg: ObsConfig, rng: random.Random,
                 sample: int | None = None, threshold: tuple[int, int] = THRESHOLD) -> PollObs:
    """values: {רשימה: {"s": מנדטים} או {"p": אחוז}}. רשימה שלא נשאלה — לא מופיעה."""
    seats = {k: v["s"] for k, v in values.items() if isinstance(v.get("s"), int) and v["s"] > 0}
    below = {k: v["p"] / 100 for k, v in values.items() if k not in seats and isinstance(v.get("p"), (int, float))}
    zero = [k for k, v in values.items() if k not in seats and k not in below]  # 0 מנדטים בלי אחוז
    if ref not in seats:
        raise ValueError(f"{poll_id}: אין מנדטים לרשימת הייחוס")
    names = list(seats) + list(below) + zero
    idx = {k: i for i, k in enumerate(names)}
    ipairs = [(idx[a], idx[b]) for a, b in pairs if a in idx and b in idx]
    target = [seats.get(k, 0) for k in names]
    known_below = sum(below.values())
    n_seated = len(seats)
    paired = {i for p in ipairs for i in p}

    acc_w, acc = 0.0, {k: [0.0, 0.0] for k in names}
    acc_share = {k: 0.0 for k in names}
    acc_wasted = 0.0
    weights_sq = 0.0
    for _ in range(cfg.draws):
        # שריפה: מה שדווח מתחת לסף + "אחרות" (אם לא דווחו — טווח קטן); בלי שום דיווח — הטווח האמפירי
        if below or others_pct is not None:
            oth = others_pct / 100 if others_pct is not None else rng.uniform(*cfg.others_default)
            zero_sh = [rng.uniform(0.002, 0.03) for _ in zero]
            wasted = known_below + oth + sum(zero_sh)
        else:
            wasted = rng.uniform(*cfg.wasted_default)
            zero_sh = [rng.uniform(0.002, 0.03) for _ in zero]
            oth = max(0.0, wasted - sum(zero_sh))
        # הצעה: לרשימה בלי הסכם עודפים — קופסת ד'הונדט המדויקת [s, s+1) (ביחס למחלק משותף); לחברת זוג — קופסה
        # מורחבת, כי מנדטי הזוג מתחלקים ביניהן בנפרד. ההכרעה — רק בהרצה במנוע (הקופסה אינה הגדרת הפתרונות).
        x = [s + (rng.uniform(-0.5, 1.5) if i in paired else rng.random()) for i, s in enumerate(target[:n_seated])]
        sx = sum(x)
        passing_share = 1.0 - wasted
        if passing_share <= 0:
            continue
        shares = [xi / sx * passing_share for xi in x] + [below[k] for k in below] + zero_sh
        votes = [max(0, int(round(sh * VALID))) for sh in shares]
        res_with = fast_seats(votes, VALID, ipairs, threshold=threshold)
        l1 = sum(abs(a - b) for a, b in zip(res_with, target))
        if ipairs and l1:
            res_without = fast_seats(votes, VALID, [], threshold=threshold)
            l1 = min(l1, sum(abs(a - b) for a, b in zip(res_without, target)))  # לא ידוע אם המכון הפעיל הסכמים
        w = math.exp(-cfg.kernel * l1)
        if w < 1e-12:
            continue
        r = shares[idx[ref]]
        for k in names:
            sk = shares[idx[k]]
            lr = math.log(max(sk, 1e-5) / r)
            a = acc[k]
            a[0] += w * lr
            a[1] += w * lr * lr
            acc_share[k] += w * sk
        acc_w += w
        weights_sq += w * w
        acc_wasted += w * (wasted)
    if acc_w <= 0:
        return PollObs(poll_id, pollster, day, {}, {}, 0.0, float("nan"), sample)
    mean = {k: a[0] / acc_w for k, a in acc.items() if k != ref}
    var = {k: max(acc[k][1] / acc_w - mean[k] ** 2, 1e-6) for k in mean}
    ess = acc_w * acc_w / weights_sq
    return PollObs(poll_id, pollster, day, mean, var, ess, acc_wasted / acc_w, sample,
                   {k: v / acc_w for k, v in acc_share.items()})


# ---------------------------------------------------------------- 2. הממוצע: קלמן עם אפקטי בית

@dataclass
class AggConfig:
    # שני הראשונים נבחרו ברשת קטנה בבדיקת העבר (pipeline/backtest.py); ההבדלים בין הערכים ברשת היו קטנים מאוד
    walk_sd: float = 0.025  # סטיית תקן יומית של ההליכה, בלוג-יחסים (≈2.5% שינוי יחסי ביום)
    nonsampling_sd: float = 0.1  # טעות שאינה דגימה — לכל סקר
    house_sd: float = 0.15  # כיווץ אפקט הבית לאפס (סטיית תקן מוקדמת, בלוג-יחסים)
    sample_cap: int = 1000  # תקרה להשפעת גודל המדגם


@dataclass
class DimResult:
    days: list[int]
    mean: list[float]  # הממוצע המוחלק בכל יום
    var: list[float]
    house: dict[str, float]  # אפקט הבית של כל מכון
    house_var: dict[str, float]


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b[0]))] for i in range(len(a))]


def _transpose(a):
    return [list(r) for r in zip(*a)]


def _inv(m):
    n = len(m)
    a = [row[:] + [1.0 if i == j else 0.0 for j in range(n)] for i, row in enumerate(m)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        piv = a[c][c]
        a[c] = [v / piv for v in a[c]]
        for r in range(n):
            if r != c and a[r][c]:
                f = a[r][c]
                a[r] = [vr - f * vc for vr, vc in zip(a[r], a[c])]
    return [row[n:] for row in a]


def smooth_dimension(obs: list[tuple[int, str, float, float]], pollsters: list[str], first_day: int, last_day: int,
                     cfg: AggConfig) -> DimResult:
    """obs: (יום, מכון, ערך, שונות). מצב = [רמה, אפקט מכון 1..H]. מסנן קלמן יומי ⇐ החלקת RTS, על כל ימי החלון
    (גם לפני התצפית הראשונה של הממד — שם ההחלקה נשענת על התצפיות הראשונות).
    אילוץ זיהוי: תצפית-דמה "סכום אפקטי הבית = 0" בתחילת החלון."""
    hidx = {h: i + 1 for i, h in enumerate(pollsters)}
    d = 1 + len(pollsters)
    first_obs = min(o[0] for o in obs)
    first = first_day
    start_level = sorted(o[2] for o in obs if o[0] <= first_obs + 7)
    x = [0.0] * d
    x[0] = start_level[len(start_level) // 2]
    P = [[0.0] * d for _ in range(d)]
    P[0][0] = 1.0
    for i in range(1, d):
        P[i][i] = cfg.house_sd ** 2

    def update(x, P, h_vec, y, r):
        ph = [sum(P[i][j] * h_vec[j] for j in range(d)) for i in range(d)]
        s = sum(h_vec[i] * ph[i] for i in range(d)) + r
        k = [v / s for v in ph]
        innov = y - sum(h_vec[i] * x[i] for i in range(d))
        x = [x[i] + k[i] * innov for i in range(d)]
        P = [[P[i][j] - k[i] * ph[j] for j in range(d)] for i in range(d)]
        return x, P

    # אילוץ סכום-אפס
    x, P = update(x, P, [0.0] + [1.0] * len(pollsters), 0.0, 1e-8)
    by_day: dict[int, list] = {}
    for o in obs:
        by_day.setdefault(o[0], []).append(o)
    q = cfg.walk_sd ** 2
    xs_f, Ps_f, xs_p, Ps_p = [], [], [], []
    days = list(range(first, last_day + 1))
    for t in days:
        if t > first:
            P = [row[:] for row in P]
            P[0][0] += q
        xs_p.append(x[:]); Ps_p.append([row[:] for row in P])
        for (_, h, y, r) in by_day.get(t, []):
            h_vec = [0.0] * d
            h_vec[0] = 1.0
            h_vec[hidx[h]] = 1.0
            x, P = update(x, P, h_vec, y, r)
        xs_f.append(x[:]); Ps_f.append([row[:] for row in P])
    # RTS: מעבר F = I, רעש רק ברמה
    xs_s, Ps_s = [None] * len(days), [None] * len(days)
    xs_s[-1], Ps_s[-1] = xs_f[-1], Ps_f[-1]
    for i in range(len(days) - 2, -1, -1):
        Pp = Ps_p[i + 1]
        C = _mat_mul(Ps_f[i], _inv(Pp))
        dx = [xs_s[i + 1][j] - xs_p[i + 1][j] for j in range(d)]
        xs_s[i] = [xs_f[i][a] + sum(C[a][b] * dx[b] for b in range(d)) for a in range(d)]
        dP = [[Ps_s[i + 1][a][b] - Pp[a][b] for b in range(d)] for a in range(d)]
        Ps_s[i] = [[Ps_f[i][a][b] + v for b, v in enumerate(row)] for a, row in enumerate(_mat_mul(_mat_mul(C, dP), _transpose(C)))]
    return DimResult(days=days, mean=[s[0] for s in xs_s], var=[p[0][0] for p in Ps_s],
                     house={h: xs_s[-1][hidx[h]] for h in pollsters},
                     house_var={h: Ps_s[-1][hidx[h]][hidx[h]] for h in pollsters})


def obs_variance(o: PollObs, k: str, ref: str, cfg: AggConfig) -> float:
    """שונות התצפית: אי-הזיהוי של ההמרה ממנדטים (מהדגימה) + טעות דגימה לפי גודל המדגם (עם תקרה; מדגם חסר ⇐ 500)
    + טעות שאינה דגימה. טעות הדגימה של log(p_k/p_ref) ≈ 1/(n·p_k) + 1/(n·p_ref)."""
    n = min(o.sample or 500, cfg.sample_cap)
    sampling = 1 / (n * max(o.share.get(k, 0.01), 0.005)) + 1 / (n * max(o.share.get(ref, 0.2), 0.005))
    return o.var[k] + sampling + cfg.nonsampling_sd ** 2


# ---------------------------------------------------------------- 3. תרחישים

@dataclass
class ScenarioConfig:
    n: int = 20000
    hist_sd_small: float = 0.25  # טעות סקרים משותפת היסטורית (לוג-אחוז) — רשימה עד 6%
    hist_sd_large: float = 0.12  # רשימה מעל 6%
    others: tuple[float, float] = (0.004, 0.015)  # הקולות לרשימות שאינן במודל


def quantiles(xs: list[float], qs=(0.1, 0.5, 0.9)) -> list[float]:
    s = sorted(xs)
    out = []
    for q in qs:
        pos = q * (len(s) - 1)
        lo = int(math.floor(pos))
        hi = min(lo + 1, len(s) - 1)
        out.append(s[lo] + (s[hi] - s[lo]) * (pos - lo))
    return out


def run_scenarios(lists: list[str], ref: str, level: dict[str, float], level_var: dict[str, float], horizon_days: int,
                  walk_sd: float, pairs: list[tuple[str, str]], cfg: ScenarioConfig, rng: random.Random,
                  bloc: list[str] | None = None):
    """level/level_var: הממוצע היום ואי-הוודאות שלו, בלוג-יחסים מול ref. מחזיר תרחישים (אחוזים ומנדטים)."""
    idx = {k: i for i, k in enumerate(lists)}
    ipairs = [(idx[a], idx[b]) for a, b in pairs if a in idx and b in idx]
    base_share = _shares_from_lr(lists, ref, level, 0.0)
    move_var = walk_sd ** 2 * horizon_days
    sims_shares, sims_seats = [], []
    for _ in range(cfg.n):
        lr = {}
        for k in lists:
            if k == ref:
                continue
            lr[k] = level[k] + rng.gauss(0, math.sqrt(level_var[k] + move_var))
        others = rng.uniform(*cfg.others)
        sh = _shares_from_lr(lists, ref, lr, others)
        # טעות סקרים משותפת: לוג-אחוז, לפי גודל הרשימה, ואז נרמול
        noisy = []
        for k in lists:
            sd = cfg.hist_sd_small if base_share[k] < 0.06 else cfg.hist_sd_large
            noisy.append(sh[k] * math.exp(rng.gauss(0, sd)))
        tot = sum(noisy) / (1 - others)
        shares = [v / tot for v in noisy]
        votes = [int(round(v * VALID)) for v in shares]
        seats = fast_seats(votes, VALID, ipairs)
        sims_shares.append(shares)
        sims_seats.append(seats)
    return sims_shares, sims_seats


def _shares_from_lr(lists: list[str], ref: str, lr: dict[str, float], others: float) -> dict[str, float]:
    ex = {k: (1.0 if k == ref else math.exp(lr[k])) for k in lists}
    tot = sum(ex.values())
    return {k: v / tot * (1 - others) for k, v in ex.items()}


# ---------------------------------------------------------------- הרצה מלאה: תצפיות ⇐ ממוצע ⇐ תרחישים

def _day(date: str) -> int:
    y, m, d = map(int, date.split("-"))
    return (_date_ord(y, m, d))


def _date_ord(y: int, m: int, d: int) -> int:
    import datetime
    return datetime.date(y, m, d).toordinal()


@dataclass
class ModelInput:
    """סקר שנכנס למודל: מזהה, מכון+מזמין, תאריך סיום העבודה בשטח, ערכים, "אחרות" (אם דווח) וגודל מדגם."""
    id: str
    pollster: str
    end: str
    values: dict[str, dict]
    others_pct: float | None = None
    sample: int | None = None


def observe_all(polls: list[ModelInput], lists: list[str], ref: str, pairs: list[tuple[str, str]], start: str,
                obs_cfg: ObsConfig, seed: int, cache: dict | None = None) -> list[PollObs]:
    """מודל התצפית לכל סקר. לכל סקר זרע משלו (לפי מזהה הסקר) — אותה תצפית בכל הרצה ובכל סדר."""
    d0 = _day(start)
    out = []
    for p in sorted(polls, key=lambda p: (p.end, p.id)):
        if _day(p.end) < d0:
            continue
        if cache is not None and p.id in cache:
            out.append(cache[p.id])
            continue
        vals = {k: v for k, v in p.values.items() if k in lists}
        o = observe_poll(p.id, p.pollster, _day(p.end) - d0, vals, p.others_pct, pairs, ref, obs_cfg,
                         random.Random(f"{seed}:{p.id}"), p.sample)
        o.end = p.end  # type: ignore[attr-defined]
        if cache is not None:
            cache[p.id] = o
        out.append(o)
    return out


def fit_average(polls: list[ModelInput], lists: list[str], ref: str, pairs: list[tuple[str, str]], start: str,
                asof: str, obs_cfg: ObsConfig, agg_cfg: AggConfig, seed: int, cache: dict | None = None) -> dict:
    """מחזיר את הממוצע המוחלק לכל ממד (לוג-יחס מול ref), אפקטי הבית והתצפיות. רק סקרים שהסתיימו ב-[start, asof]."""
    d0, d1 = _day(start), _day(asof)
    all_obs = observe_all([p for p in polls if _day(p.end) <= d1], lists, ref, pairs, start, obs_cfg, seed, cache)
    observed: list[PollObs] = []
    skipped: list[str] = []
    for o in all_obs:
        if o.ess < obs_cfg.min_ess:
            skipped.append(o.poll_id)  # המנוע אינו משחזר את הסקר — ארכיון בלבד
            continue
        observed.append(o)
    pollsters = sorted({o.pollster for o in observed})
    last = d1 - d0
    dims = {}
    for k in lists:
        if k == ref:
            continue
        obs = [(o.day, o.pollster, o.mean[k], obs_variance(o, k, ref, agg_cfg)) for o in observed if k in o.mean]
        if not obs:
            continue
        hs = sorted({x[1] for x in obs})
        dims[k] = smooth_dimension(obs, hs, 0, last, agg_cfg)
    return {"start": start, "asof": asof, "observed": observed, "skipped": skipped, "pollsters": pollsters, "dims": dims,
            "wasted": quantiles([o.wasted for o in observed]) if observed else None}


def level_at_end(fit: dict) -> tuple[dict[str, float], dict[str, float]]:
    level = {k: r.mean[-1] for k, r in fit["dims"].items()}
    var = {k: r.var[-1] for k, r in fit["dims"].items()}
    return level, var


def summarize_scenarios(lists: list[str], sims_shares, sims_seats, sims_seats_noag=None, bloc: list[str] | None = None,
                        groups: dict[str, list[str]] | None = None):
    idx = {k: i for i, k in enumerate(lists)}
    n = len(sims_seats)
    out = {"n": n, "lists": {}}
    for k in lists:
        i = idx[k]
        seats = [s[i] for s in sims_seats]
        shares = [s[i] * 100 for s in sims_shares]
        q = quantiles(seats)
        out["lists"][k] = {
            "seats": [round(x) for x in q],
            "seatsMean": round(sum(seats) / n, 2),
            "share": [round(x, 2) for x in quantiles(shares)],
            "pass": round(sum(1 for x in seats if x > 0) / n, 4),
        }
        if sims_seats_noag is not None:
            gain = [a[i] - b[i] for a, b in zip(sims_seats, sims_seats_noag)]
            out["lists"][k]["agreementGain"] = round(sum(gain) / n, 3)
    if sims_seats_noag is not None:
        out["agreementsMoveSeat"] = round(sum(1 for a, b in zip(sims_seats, sims_seats_noag) if a != b) / n, 4)
    wasted = [100 * (1 - sum(sh for sh, se in zip(shs, ses) if se > 0)) for shs, ses in zip(sims_shares, sims_seats)]
    out["wasted"] = [round(x, 2) for x in quantiles(wasted)]
    out["wastedMean"] = round(sum(wasted) / len(wasted), 2)
    if bloc:
        b = [sum(s[idx[k]] for k in bloc if k in idx) for s in sims_seats]
        out["bloc"] = {"lists": bloc, "seats": [round(x) for x in quantiles(b)], "atLeast61": round(sum(1 for x in b if x >= 61) / n, 4)}
    if groups:
        # קבוצת רשימות (למשל "משפחה" מ-2022): הטווח של הסכום בכל תרחיש — לא סכום הטווחים
        out["groups"] = {}
        for gid, members in groups.items():
            ii = [idx[k] for k in members if k in idx]
            sh = [100 * sum(s[i] for i in ii) for s in sims_shares]
            se = [sum(s[i] for i in ii) for s in sims_seats]
            out["groups"][gid] = {"share": [round(x, 2) for x in quantiles(sh)], "seats": [round(x) for x in quantiles(se)]}
    return out


def scenarios(fit: dict, lists: list[str], ref: str, pairs: list[tuple[str, str]], election_day: str,
              agg_cfg: AggConfig, sc_cfg: ScenarioConfig, seed: int, bloc: list[str] | None = None,
              with_noag: bool = True, groups: dict[str, list[str]] | None = None) -> dict:
    level, var = level_at_end(fit)
    model_lists = [ref] + [k for k in lists if k in level]
    horizon = max(0, _day(election_day) - _day(fit["asof"]))
    rng = random.Random(seed)
    sh, se = run_scenarios(model_lists, ref, level, var, horizon, agg_cfg.walk_sd, pairs, sc_cfg, rng, bloc)
    noag = None
    if with_noag and pairs:
        noag = [fast_seats([int(round(v * VALID)) for v in shares], VALID, []) for shares in sh]
    summ = summarize_scenarios(model_lists, sh, se, noag, bloc, groups)
    summ["horizonDays"] = horizon
    return summ


def central_seats(fit: dict, lists: list[str], ref: str, pairs: list[tuple[str, str]], others: float = 0.008):
    """המנדטים לפי הממוצע עצמו (בלי תרחישים) — לכל יום בחלון. לגרף המגמה."""
    days = next(iter(fit["dims"].values())).days
    model_lists = [ref] + [k for k in lists if k in fit["dims"]]
    idx = {k: i for i, k in enumerate(model_lists)}
    ipairs = [(idx[a], idx[b]) for a, b in pairs if a in idx and b in idx]
    out = []
    for t_i, t in enumerate(days):
        lr = {k: fit["dims"][k].mean[t_i] for k in model_lists if k != ref}
        sh = _shares_from_lr(model_lists, ref, lr, others)
        votes = [int(round(sh[k] * VALID)) for k in model_lists]
        seats = fast_seats(votes, VALID, ipairs)
        out.append({"day": t, "shares": {k: round(sh[k] * 100, 2) for k in model_lists},
                    "seats": {k: seats[idx[k]] for k in model_lists}})
    return out
