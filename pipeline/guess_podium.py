"""פודיום הניחושים (הכרעת בעלים 28/10): שלושת הניחושים המדויקים מול הספירה הנוכחית ⇐ src/data/guessPodium.json.
קלט: קובץ התשובה של admin_get_guesses (ניחושים בלי מזהים). רץ בכל עדכון תוצאות (סקיל results-update).
דירוג: אחוז דיוק, אחר כך מספר המפלגות המדויקות, ובשוויון — מי ששמר קודם. ניחוש שנדחה או שאינו 120 מנדטים — לא נכלל."""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
actual = json.loads((ROOT / "raw/results-2026.json").read_text())["seats"]
rows = json.loads(pathlib.Path(sys.argv[1]).read_text())["rows"]
out = []
for r in rows:
    s = r.get("seats") or {}
    if r.get("status") == "rejected" or sum(s.values()) != 120:
        continue
    # אחוז הדיוק כמו accuracyPct ב-src/lib/guessAccuracy.ts: המנדטים במקום הלא נכון מתוך 120
    err = sum(abs(s.get(i, 0) - actual.get(i, 0)) for i in set(s) | set(actual))
    exact = sum(1 for i, v in actual.items() if v > 0 and s.get(i, 0) == v)
    out.append({"acc": round(100 * (1 - err / 240), 1), "exact": exact, "savedAt": r["savedAt"]})
out.sort(key=lambda x: (-x["acc"], -x["exact"], x["savedAt"]))
(ROOT / "src/data/guessPodium.json").write_text(json.dumps({"n": len(out), "top": out[:3]}, ensure_ascii=False, indent=1) + "\n")
print(out[:3])
