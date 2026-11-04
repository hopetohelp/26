"""מדגמי ליל הבחירות של המערכות הקודמות (raw/exit-polls-history.json) — בדיקה והוספה למחזורי history.json.

כל רשומה: מדגם של ערוץ אחד בשעת פרסום אחת (22:00, וכל עדכון באותו לילה כשורה נפרדת).
המבנה במחזור זהה ל-polls.json.exitPolls, והמפתחות הם אותיות הרשימות של אותה מערכת.
המדגמים אינם סקר: אינם נכנסים לממוצעים, למודל, ל-backtest או לדיוק הסקרים.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "raw" / "exit-polls-history.json"
STATUSES = {"match", "corrected", "partial", "unverified"}
LEVELS = {"primary", "press", "aggregator"}
VERIFIED = {"match", "corrected"}
FIELDS = ("id", "knesset", "firm", "firmHe", "publisher", "publisherHe", "publishedAt", "values", "urls", "status", "sourceLevel", "note")


def check(records: list[dict], results: list[dict]) -> list[str]:
    """רשימת שגיאות (ריקה = תקין): שדות חובה, קישור, מפתחות של אותה מערכת, סכום 120 או partial."""
    letters = {r["knesset"]: {l["letters"] for l in r["lists"]} for r in results}
    dates = {r["knesset"]: r["date"] for r in results}
    errors, seen = [], set()
    for d in records:
        rid = d.get("id", "?")
        missing = [f for f in FIELDS if f not in d]
        if missing:
            errors.append(f"{rid}: חסרים שדות {missing}")
            continue
        if rid in seen:
            errors.append(f"{rid}: מזהה כפול")
        seen.add(rid)
        n = d["knesset"]
        if n not in letters:
            errors.append(f"{rid}: אין תוצאות לכנסת {n}")
            continue
        if d["status"] not in STATUSES or d["sourceLevel"] not in LEVELS:
            errors.append(f"{rid}: status/sourceLevel לא חוקי")
        if d["sourceLevel"] == "aggregator" and d["status"] in VERIFIED:
            errors.append(f"{rid}: ממקור משני בלבד — אינו יכול להיות מאומת")
        if not d["urls"] or not all(isinstance(u, str) and u.startswith("http") for u in d["urls"]):
            errors.append(f"{rid}: בלי קישור למקור")
        t = datetime.fromisoformat(d["publishedAt"])
        if t.tzinfo is None:
            errors.append(f"{rid}: מועד פרסום בלי אזור זמן")
        elif not (t.date().isoformat() == dates[n] or (t.hour < 8 and (t.date().toordinal() - datetime.fromisoformat(dates[n]).toordinal()) == 1)):
            errors.append(f"{rid}: מועד הפרסום אינו בליל הבחירות ({dates[n]})")
        bad = sorted(set(d["values"]) - letters[n])
        if bad:
            errors.append(f"{rid}: מפתחות שאינם רשימות בכנסת {n}: {bad}")
        if any(set(v) != {"s"} or not isinstance(v["s"], int) or v["s"] < 0 for v in d["values"].values()):
            errors.append(f"{rid}: ערך שאינו מספר מנדטים")
            continue
        total = sum(v["s"] for v in d["values"].values())
        if total != 120 and d["status"] != "partial":
            errors.append(f"{rid}: סכום המנדטים {total} ולא 120 (ואינו מסומן partial)")
    return errors


def load(results: list[dict]) -> dict[int, list[dict]]:
    """המדגמים לכל כנסת, במבנה polls.json.exitPolls. שגיאה מפילה את הבנייה."""
    if not PATH.exists():
        return {}
    records = json.loads(PATH.read_text(encoding="utf-8"))
    errors = check(records, results)
    if errors:
        raise SystemExit("raw/exit-polls-history.json:\n" + "\n".join(errors))
    out: dict[int, list[dict]] = {}
    for d in records:
        seat_sum = sum(v["s"] for v in d["values"].values())
        out.setdefault(d["knesset"], []).append({k: v for k, v in d.items() if k != "knesset"} | {
            "verified": d["status"] in VERIFIED, "seatSum": seat_sum})
    for v in out.values():
        v.sort(key=lambda p: (p["publishedAt"], p["publisher"]))
    return out
