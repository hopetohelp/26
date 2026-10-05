"""בדיקת עבר של המודל: חמש המערכות 2019א–2022, 21/14/7/1 ימים לפני הבחירות — רק עם סקרים שהיו זמינים אז.

הרצה: python3 pipeline/backtest.py   (כדקה-שתיים; הפלט: src/data/backtest.json)
יש להריץ מחדש בכל שינוי ב-pipeline/model.py — הבדיקות נכשלות אם חתימת המודל בקובץ אינה תואמת.

לכל נקודה: טעות המנדטים של המודל, כיסוי טווחי 80%, ציון ברייר לשאלת אחוז החסימה, והגוש — מול שלושה מתחרים
פשוטים: ממוצע 7 הימים האחרונים, הסקר האחרון, וחציון הסקר האחרון של כל מכון ב-14 ימים (שיטת "המצב היום").
טעות הסקרים ההיסטורית (השכבה השלישית) נאמדת לכל מערכת **רק מארבע האחרות** — בלי דליפה מהעתיד.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as M  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
HORIZONS = [21, 14, 7, 1]
SEED = 26
N_SCEN = 4000


def model_signature() -> str:
    return hashlib.sha256((Path(__file__).resolve().parent / "model.py").read_bytes()).hexdigest()[:16]


def load():
    results = {r["id"]: r for r in json.loads((DATA / "results.json").read_text(encoding="utf-8"))}
    cycles = json.loads((DATA / "history.json").read_text(encoding="utf-8"))["cycles"]
    return results, cycles


def inputs_for(cycle: dict) -> list[M.ModelInput]:
    return [M.ModelInput(p["id"], f"{p['firmKey']}|{p['publisherHe'] or ''}", p["end"], p["values"])
            for p in cycle["polls"] if p["consistent"] and p["end"] < cycle["date"]]


def seats_of(p, letters):
    v = p.values.get(letters)
    if not v:
        return None
    return v["s"] if "s" in v else 0


def baselines(inputs: list[M.ModelInput], asof: str, lists: list[str]) -> dict[str, dict[str, float]]:
    """שלושת המתחרים הפשוטים, במנדטים."""
    d = date.fromisoformat(asof)
    avail = [p for p in inputs if p.end <= asof]
    last7 = [p for p in avail if date.fromisoformat(p.end) > d - timedelta(days=7)]
    out = {}
    out["avg7"] = {k: _mean([seats_of(p, k) for p in last7]) for k in lists}
    last = max(avail, key=lambda p: (p.end, p.id))
    out["lastPoll"] = {k: float(seats_of(last, k) or 0) for k in lists}
    latest = {}
    for p in avail:
        if date.fromisoformat(p.end) <= d - timedelta(days=14):
            continue
        if p.pollster not in latest or p.end > latest[p.pollster].end:
            latest[p.pollster] = p
    out["median14"] = {k: _median([seats_of(p, k) for p in latest.values()]) for k in lists}
    return out


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0.0


def _median(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return 0.0
    m = len(xs) // 2
    return float(xs[m]) if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def run() -> dict:
    results, cycles = load()
    obs_cfg, agg_cfg = M.ObsConfig(), M.AggConfig()
    prepared = []
    for c in cycles:
        r = results[c["id"]]
        inputs = inputs_for(c)
        polled = {k for p in inputs for k in p.values}
        lists = [l["letters"] for l in r["lists"] if l["letters"] in polled]
        pairs = [tuple(a) for a in r["agreements"]]
        start = min(p.end for p in inputs)
        prepared.append((c, r, inputs, lists, pairs, start, {}))

    # שלב 1: הממוצע ערב הבחירות בכל מערכת ⇐ טעויות הלוג-אחוז, לאמידת השכבה השלישית
    final_err: dict[str, list[tuple[float, float]]] = {}
    for c, r, inputs, lists, pairs, start, cache in prepared:
        asof = (date.fromisoformat(c["date"]) - timedelta(days=1)).isoformat()
        fit = M.fit_average(inputs, lists, "מחל", pairs, start, asof, obs_cfg, agg_cfg, SEED, cache)
        level, _ = M.level_at_end(fit)
        model_lists = ["מחל"] + [k for k in lists if k in level]
        sh = M._shares_from_lr(model_lists, "מחל", level, 0.0)
        actual = {l["letters"]: l["votes"] / r["valid"] for l in r["lists"]}
        tot_actual = sum(actual[k] for k in model_lists)
        errs = []
        for k in model_lists:
            a = actual[k] / tot_actual
            if a > 0.005:
                errs.append((a, math.log(sh[k] / a)))
        final_err[c["id"]] = errs

    def hist_sd(exclude: str):
        small = [e for cid, es in final_err.items() if cid != exclude for a, e in es if a < 0.06]
        large = [e for cid, es in final_err.items() if cid != exclude for a, e in es if a >= 0.06]
        rms = lambda xs: math.sqrt(sum(x * x for x in xs) / len(xs))  # noqa: E731
        return rms(small), rms(large)

    # שלב 2: כל מערכת × כל נקודת זמן
    rows = []
    for c, r, inputs, lists, pairs, start, cache in prepared:
        actual = {l["letters"]: l["seats"] for l in r["lists"]}
        bloc = c["recommendedNetanyahu"]
        sd_small, sd_large = hist_sd(c["id"])
        for h in HORIZONS:
            asof = (date.fromisoformat(c["date"]) - timedelta(days=h)).isoformat()
            fit = M.fit_average(inputs, lists, "מחל", pairs, start, asof, obs_cfg, agg_cfg, SEED, cache)
            sc_cfg = M.ScenarioConfig(n=N_SCEN, hist_sd_small=sd_small, hist_sd_large=sd_large)
            sc = M.scenarios(fit, lists, "מחל", pairs, c["date"], agg_cfg, sc_cfg, SEED + h, bloc=bloc, with_noag=False)
            sc["horizonDays"] = h  # מהבחירות לאחור, לא מהסקר האחרון
            model_lists = list(sc["lists"])
            central = M.central_seats(fit, lists, "מחל", pairs, 0.01)[-1]["seats"]
            mae = sum(abs(central[k] - actual[k]) for k in model_lists) / len(model_lists)
            # כיסוי — על הרשימות שיש בהן הכרעה (נכנסו לכנסת או קיבלו מנדטים בתרחיש החציוני); רשימה זעירה "מכוסה" תמיד
            rel = [k for k in model_lists if actual[k] > 0 or sc["lists"][k]["seats"][1] > 0]
            cover = sum(1 for k in rel if sc["lists"][k]["seats"][0] <= actual[k] <= sc["lists"][k]["seats"][2]) / len(rel)
            brier = sum((sc["lists"][k]["pass"] - (1 if actual[k] > 0 else 0)) ** 2 for k in model_lists) / len(model_lists)
            base = baselines(inputs, asof, model_lists)
            base_mae = {name: sum(abs(v[k] - actual[k]) for k in model_lists) / len(model_lists) for name, v in base.items()}
            bloc_actual = sum(actual[k] for k in bloc)
            rows.append({
                "cycle": c["id"], "label": c["label"], "horizon": h, "asof": asof, "polls": len(fit["observed"]),
                "mae": round(mae, 3), "coverage80": round(cover, 3), "brier": round(brier, 4),
                "baselineMae": {k: round(v, 3) for k, v in base_mae.items()},
                "bloc": {"model": sc["bloc"]["seats"], "actual": bloc_actual,
                         "baselines": {name: round(sum(v[k] for k in bloc), 1) for name, v in base.items()}},
                "lists": {k: {"seats": sc["lists"][k]["seats"], "central": central[k], "pass": sc["lists"][k]["pass"],
                              "actual": actual[k]} for k in model_lists},
            })
            print(f"{c['id']} −{h:>2}d  polls {len(fit['observed']):>2}  MAE {mae:.2f}  "
                  f"(7d {base_mae['avg7']:.2f} · last {base_mae['lastPoll']:.2f} · med14 {base_mae['median14']:.2f})  "
                  f"cover80 {cover:.2f}  brier {brier:.3f}  bloc {sc['bloc']['seats']} vs {bloc_actual}", flush=True)
    summary = {}
    for h in HORIZONS:
        rs = [x for x in rows if x["horizon"] == h]
        summary[str(h)] = {
            "mae": round(sum(x["mae"] for x in rs) / len(rs), 3),
            "coverage80": round(sum(x["coverage80"] for x in rs) / len(rs), 3),
            "brier": round(sum(x["brier"] for x in rs) / len(rs), 4),
            "baselineMae": {k: round(sum(x["baselineMae"][k] for x in rs) / len(rs), 3) for k in rs[0]["baselineMae"]},
            "blocCovered": sum(1 for x in rs if x["bloc"]["model"][0] <= x["bloc"]["actual"] <= x["bloc"]["model"][2]),
        }
    sd_all = (math.sqrt(sum(e * e for es in final_err.values() for a, e in es if a < 0.06) /
                        max(1, sum(1 for es in final_err.values() for a, e in es if a < 0.06))),
              math.sqrt(sum(e * e for es in final_err.values() for a, e in es if a >= 0.06) /
                        max(1, sum(1 for es in final_err.values() for a, e in es if a >= 0.06))))
    return {"modelSignature": model_signature(), "horizons": HORIZONS, "scenarios": N_SCEN, "rows": rows,
            "summary": summary, "histSd": {"small": round(sd_all[0], 4), "large": round(sd_all[1], 4)}}


if __name__ == "__main__":
    out = run()
    (DATA / "backtest.json").write_text(json.dumps(out, ensure_ascii=False, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
    print("histSd", out["histSd"])
