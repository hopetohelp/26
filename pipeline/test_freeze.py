"""בדיקות ההקפאה (16ה(ח)) בשעון מזויף: לפני/בדיוק/אחרי שני הגבולות, כולל המעבר לשעון חורף ב-25.10.

הרצה: python3 pipeline/test_freeze.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
META = ROOT / "src" / "data" / "meta.json"
POLLS = ROOT / "src" / "data" / "polls.json"


def build(at: str) -> tuple[dict, list]:
    env = {**os.environ, "BUILD_TIME": at, "SKIP_MODEL": "1"}  # המודל אינו תלוי בהקפאה מעבר לסקרים שנכנסים
    subprocess.run([sys.executable, str(ROOT / "pipeline" / "build_data.py")], check=True, env=env,
                   stdout=subprocess.DEVNULL)
    return json.loads(META.read_text()), json.loads(POLLS.read_text())["polls"]


CASES = [
    ("2026-10-23T11:59:00+03:00", False),  # יום שישי לפני הצהריים — עוד לא
    ("2026-10-23T12:00:00+03:00", True),   # מצהרי שישי — באנר קבוע (הבנייה האחרונה)
    ("2026-10-24T00:00:00+03:00", True),   # בדיוק תחילת האיסור
    ("2026-10-25T03:00:00+02:00", True),   # אחרי המעבר לשעון חורף
    ("2026-10-27T21:59:00+02:00", True),   # דקה לפני סגירת הקלפיות
    ("2026-10-27T22:00:00+02:00", False),  # בדיוק בסגירה — האיסור נגמר
]

failed = 0
original = json.loads(META.read_text())["dataAsOf"]
try:
    for at, expect in CASES:
        meta, polls = build(at)
        if meta["frozen"] != expect:
            print(f"❌ {at}: frozen={meta['frozen']}, ציפינו {expect}")
            failed += 1
        bad = [p["id"] for p in polls if "2026-10-24T00:00:00+03:00" <= p["assumedPublishedAt"] < "2026-10-27T22:00:00+02:00"]
        if bad:
            print(f"❌ {at}: סקרים שפורסמו בתקופת האיסור נכנסו: {bad[:3]}")
            failed += 1
finally:
    build(original)  # מחזיר את קובצי הנתונים למצבם המקורי
print("✅ כל בדיקות ההקפאה עברו" if not failed else f"{failed} כשלים")
sys.exit(1 if failed else 0)
