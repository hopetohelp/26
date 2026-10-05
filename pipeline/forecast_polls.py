"""מרכיב את raw/forecast/polls.json — הסקרים שנכנסים למודל החיזוי — מרשומות האימות שב-raw/forecast/verification/.

לכל סקר: מזהה, מערכת, סדרת מכון, תאריך סיום השטח (לפי המקור כשהוא שונה מוויקיפדיה), ערכים לפי אותיות הרשימה,
סטטוס האימות ורמת המקור. 2019–2022: הערכים מ-src/data/history.json (המיפוי לאותיות כבר קיים שם), והאימות קובע אם
הסקר נכנס. 2013/2015: הערכים מהתמלול מול המקור (seatsByLetters).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VER = ROOT / "raw" / "forecast" / "verification"
OUT = ROOT / "raw" / "forecast" / "polls.json"

# זהות מכון: מזהה יציב לסדרה, לפי השם (בלי מזמין). ספק ⇐ סדרה נפרדת. TNS טלסקר ⇐ קנטר (אותו גוף, שם חדש),
# כמו בטבלת המכונים של "דיוק הסקרים" (build_data.HIST_FIRMS). מנו גבע = ראש מדגם.
FIRM_SERIES = [
    (r"dahaf", "dahaf"), (r"midgam\s*project|project\s*hamidgam|hamidgam\s*project", "midgam_project"),
    (r"midgam|mano geva", "midgam"), (r"panels", "panels_politics"), (r"smith", "smith"),
    (r"maagar\s*moc?hot", "maagar_mochot"), (r"dialog", "dialog"), (r"teleseker|tns|kantar", "kantar"),
    (r"new wave", "new_wave"), (r"geocartography", "geocartography"), (r"\btri\b", "tri"),
]


def series_of(firm: str | None, knesset: int, publisher: str | None) -> str:
    f = (firm or "").lower()
    for pat, key in FIRM_SERIES:
        if re.search(pat, f):
            return key
    return f"unknown-k{knesset}-{re.sub(r'[^a-z0-9]+', '-', (publisher or 'x').lower()).strip('-')}"


def level_from_note(note: str | None) -> str:
    return "aggregator" if re.search(r"knesset\s*jeremy|knessetjeremy", note or "", re.I) else "primary"


def build() -> list[dict]:
    history = json.loads((ROOT / "src" / "data" / "history.json").read_text(encoding="utf-8"))
    by_id = {p["id"]: (c["knesset"], p) for c in history["cycles"] for p in c["polls"]}
    results = json.loads((ROOT / "src" / "data" / "results.json").read_text(encoding="utf-8"))
    names = {e["knesset"]: {l["short"]: l["letters"] for l in e["lists"]} for e in results}
    out = []
    for qf, rf in [("k21_k25_final_queue.json", "k21_k25_final_results.json"),
                   ("k21_k25_windows_queue.json", "k21_k25_windows_results.json")]:
        if not (VER / rf).exists():
            continue
        res = {r["id"]: r for r in json.loads((VER / rf).read_text(encoding="utf-8"))}
        for q in json.loads((VER / qf).read_text(encoding="utf-8")):
            r = res.get(q["id"])
            if not r:
                continue
            k, p = by_id[q["id"]]
            values = {kk: dict(v) for kk, v in p["values"].items()}
            for d in r.get("differences") or []:  # המקור גובר: תיקון מנדטים לפי שם הרשימה
                letters = names[k].get(d.get("list"))
                if letters and isinstance(d.get("source"), int):
                    values[letters] = {"s": d["source"]}
            out.append({"id": q["id"], "knesset": k, "series": p["firmKey"],
                        "fieldEnd": r.get("fieldEndSource") or p["end"], "values": values,
                        "status": r["status"], "sourceLevel": r.get("sourceLevel") or level_from_note(r.get("note")),
                        "source": r.get("source")})
    for qf, rf in [("k19_k20_final_queue.json", "k19_k20_final_results.json"),
                   ("k19_k20_windows_queue.json", "k19_k20_windows_results.json")]:
        if not (VER / rf).exists():
            continue
        queue = {q["id"]: q for q in json.loads((VER / qf).read_text(encoding="utf-8"))}
        for r in json.loads((VER / rf).read_text(encoding="utf-8")):
            q = queue.get(r["id"], {})
            k = q.get("knesset") or int(r["id"][1:3])
            seats = r.get("seatsByLetters") or {}
            values = {kk: {"s": v} for kk, v in seats.items() if isinstance(v, (int, float))}
            total = sum(v["s"] for v in values.values())
            status = r["status"] if 118 <= total <= 122 else ("inconsistent" if r["status"] in ("match", "corrected") else r["status"])
            out.append({"id": r["id"], "knesset": k, "series": series_of(r.get("firm"), k, r.get("publisher")),
                        "fieldEnd": r.get("fieldEnd") or q.get("fieldEnd"), "values": values, "status": status,
                        "sourceLevel": r.get("sourceLevel") or "primary", "source": r.get("source")})
    out.sort(key=lambda x: (x["knesset"], x["fieldEnd"] or "", x["id"]))
    return out


if __name__ == "__main__":
    rows = build()
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from collections import Counter
    print(len(rows), Counter((r["knesset"], r["status"]) for r in rows))
