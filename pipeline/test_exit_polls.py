"""בדיקת מדגמי ליל הבחירות: raw/exit-polls-history.json ו-raw/exit-polls.json (2026).

לכל מדגם: סכום מנדטים 120 (או status "partial"), קישור למקור, ומפתחות שהם רשימות של אותה מערכת.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exit_polls import PATH, check  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
results = json.loads((ROOT / "src" / "data" / "results.json").read_text(encoding="utf-8"))
k20 = next(r for r in results if r["knesset"] == 20)

# 1. הקובץ עצמו תקין, וכל מחזור ב-history.json נושא בדיוק את המדגמים שלו
records = json.loads(PATH.read_text(encoding="utf-8")) if PATH.exists() else []
errors = check(records, results)
assert not errors, "\n".join(errors)
history = json.loads((ROOT / "src" / "data" / "history.json").read_text(encoding="utf-8"))
for c in history["cycles"]:
    want = sorted(d["id"] for d in records if d["knesset"] == c["knesset"])
    assert sorted(p["id"] for p in c.get("exitPolls", [])) == want, f"{c['id']}: exitPolls אינו תואם ל-raw (הרץ build_data.py)"

# 2. מדגמי 2026 (raw/exit-polls.json): 120, קישור, ומפתחות הרשימות של 2026
meta = json.loads((ROOT / "src" / "data" / "meta.json").read_text(encoding="utf-8"))
ids26 = {l["id"] for l in meta["lists2026"]}
for d in json.loads((ROOT / "raw" / "exit-polls.json").read_text(encoding="utf-8")):
    assert d["urls"], f"{d['id']}: בלי קישור"
    assert set(d["values"]) <= ids26, f"{d['id']}: מפתח לא מוכר {set(d['values']) - ids26}"
    assert sum(v["s"] for v in d["values"].values()) == 120 or d.get("status") == "partial", f"{d['id']}: סכום אינו 120"

# 3. הבדיקה תופסת שגיאות
good = {"id": "t", "knesset": 20, "firm": "F", "firmHe": "ף", "publisher": "P", "publisherHe": "פ",
        "publishedAt": "2015-03-17T22:00:00+02:00", "values": {"מחל": {"s": 60}, "אמת": {"s": 60}},
        "urls": ["https://example.org"], "status": "match", "sourceLevel": "press", "note": ""}
assert check([good], [k20]) == []
assert check([{**good, "values": {"מחל": {"s": 59}, "אמת": {"s": 60}}}], [k20])  # 119
assert check([{**good, "values": {"מחל": {"s": 59}, "אמת": {"s": 60}}, "status": "partial"}], [k20]) == []
assert check([{**good, "urls": []}], [k20])  # בלי קישור
assert check([{**good, "values": {"מחל": {"s": 60}, "likud": {"s": 60}}}], [k20])  # מפתח של מערכת אחרת
assert check([{**good, "sourceLevel": "aggregator"}], [k20])  # ויקיפדיה בלבד אינה "אומת"
assert check([{**good, "publishedAt": "2015-03-10T22:00:00+02:00"}], [k20])  # לא בליל הבחירות
assert check([{**good, "publishedAt": "2015-03-18T02:28:00+02:00"}], [k20]) == []  # עדכון אחרי חצות
assert check([good, good], [k20])  # מזהה כפול
print(f"exit polls OK: {len(records)} historical records")
