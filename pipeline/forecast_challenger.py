"""חלופת מחקר: שילוב תחזיות ובחירה כרונולוגית לפי דיוק המנדטים בעבר.

אינו מחליף את המודל הציבורי. כל החלופות והניסויים מדווחים; האופקים הם
מדידות חוזרות של אותן מערכות בחירות, ולא 95 ניסויים עצמאיים.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import forecast as F

CANDIDATES = {"baseline": 0.0, "blend": 0.5, "trend": 1.0}


def choose(history: list[dict]) -> str:
    """מנדטים הם היעד; בשוויון נשארים בחלופה הפשוטה. בלי תוצאות העתיד."""
    if not history:
        return "baseline"
    return max(CANDIDATES, key=lambda name: sum(r[name]["seatAccuracy"] for r in history))


def mix(base: dict, trend: dict, weight: float) -> dict:
    """שילוב באחוזי קולות, לפני הסף והקצאת המנדטים; בלי נרמול נוסף."""
    return {k: (1 - weight) * base.get(k, 0.0) + weight * trend.get(k, 0.0)
            for k in sorted(set(base) | set(trend))}


def evaluate(backtest: dict, spec: dict, elections: dict) -> dict:
    history, rows = [], []
    for row in sorted(backtest["rows"], key=lambda r: r["knesset"]):
        e = elections[row["knesset"]]
        base = row["variants"]["V0"]["shares"]
        trend = row["variants"]["V5"]["shares"]
        # בהיעדר קו בסיס אין השוואה תקפה; אין לתת לניבוי ריק ציון.
        if not base or not trend:
            continue
        selected = choose(history)
        scores = {}
        for name, weight in CANDIDATES.items():
            shares = mix(base, trend, weight)
            seats = F.seats_from_shares(shares, e.agreements, e.threshold)
            scores[name] = {
                "voteAccuracy": F.vote_accuracy(shares, e.shares(), spec["gate"]["unitMinShare"]),
                "seatAccuracy": F.seat_accuracy(seats, e.seats),
                "seats": {k: v for k, v in seats.items() if v},
            }
        rows.append({"knesset": e.knesset, "trainedOn": [r["knesset"] for r in rows],
                     "selected": selected, "scores": {**scores, "adaptive": scores[selected]}})
        # תוצאת המערכת הנוכחית נכנסת רק לאחר בחירת התחזית שלה.
        history.append(scores)
    gate_rows = [r for r in rows if r["knesset"] in spec["gate"]["elections"]]
    valid = {r["knesset"] for r in gate_rows} == set(spec["gate"]["elections"])
    summary = {name: {metric: sum(r["scores"][name][metric] for r in gate_rows) / len(gate_rows)
                      for metric in ("voteAccuracy", "seatAccuracy")}
               for name in (*CANDIDATES, "adaptive")} if valid else {}
    return {"horizon": backtest["horizon"], "valid": valid, "rows": rows, "summary": summary}


def run(cached: list[dict] | None = None) -> dict:
    spec = F.load_spec()
    elections = F.load_elections(spec)
    backtests = cached if cached is not None else [F.run_backtest(spec, h) for h in spec["data"]["horizons"]]
    results = [evaluate(b, spec, elections) for b in backtests]
    valid = [r for r in results if r["valid"]]
    average = {name: {metric: sum(r["summary"][name][metric] for r in valid) / len(valid)
                      for metric in ("voteAccuracy", "seatAccuracy")}
               for name in (*CANDIDATES, "adaptive")} if valid else {}
    files = ["pipeline/forecast.py", "pipeline/forecast_trend.py", "pipeline/model.py",
             "pipeline/forecast_spec.json", "pipeline/forecast_challenger.py",
             "raw/forecast/polls.json", "src/data/results.json",
             "raw/cec/k19_expb.csv", "raw/cec/k20_expc.csv"]
    return {"researchOnly": True, "specVersion": spec["version"],
            "warning": "מחקר בדיעבד; אין מערכת בחירות חדשה שלא נבחנה. שיפור קטן אינו הוכחת דיוק עתידי.",
            "candidateWeights": CANDIDATES, "selectionMetric": "seatAccuracy",
            "provenance": {name: hashlib.sha256((F.ROOT / name).read_bytes()).hexdigest() for name in files},
            "repeatedHorizonAverage": average, "results": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run()
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["repeatedHorizonAverage"], ensure_ascii=False, indent=2))
