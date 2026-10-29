"""יומן עדכוני תוצאות 2026 (הכרעת בעלים 29.10.2026) — נבנה מחדש מהיסטוריית git, כך שאין רישום ידני כפול.

    git fetch --depth=3000 origin main   # בשכפול חלקי (shallow) — כדי שכל ההיסטוריה תהיה זמינה
    python3 pipeline/results_log.py

מקור אחד: כל גרסה של raw/results-2026.json ושל raw/ballots-2026.csv שנכנסה לענף הראשי, ושינויי קוד החישוב.
פלט: docs/יומן-עדכוני-תוצאות-2026.md
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "יומן-עדכוני-תוצאות-2026.md"
RESULTS, BALLOTS = "raw/results-2026.json", "raw/ballots-2026.csv"
# קוד שקובע איך מחושבים המנדטים ו"מה השתנה"
CODE = ["pipeline/fetch_results_2026.py", "pipeline/voter_flow.py", "src/engine/baderOfer.ts", "src/engine/seatChange.ts"]
SHORT = {"likud": "הליכוד", "yashar": "ישר!", "joint": "המשותפת", "together": "ביחד", "democrats": "הדמוקרטים", "utj": "יהדות התורה",
         "yb": "ישראל ביתנו", "otzma": "עוצמה", "shas": "ש\"ס", "rzp": "הצ\"ד", "raam": "רע\"ם"}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True, env={**os.environ, "TZ": "Asia/Jerusalem"}).stdout


def commits(*paths: str) -> list[tuple[str, str, str]]:
    """(hash, תאריך ושעה בשעון ישראל, כותרת) מהישן לחדש"""
    out = git("log", "--reverse", "--format=%h|%ad|%s", "--date=format-local:%d/%m %H:%M", "HEAD", "--", *paths)
    return [tuple(line.split("|", 2)) for line in out.splitlines() if line]  # type: ignore[misc]


def show(h: str, path: str) -> str | None:
    try:
        return git("show", f"{h}:{path}")
    except subprocess.CalledProcessError:
        return None


def seats_line(seats: dict) -> str:
    return " · ".join(f"{SHORT.get(k, k)} {v}" for k, v in sorted(seats.items(), key=lambda x: -x[1]) if v)


def main() -> int:
    if git("rev-parse", "--is-shallow-repository").strip() == "true":
        print("::warning::שכפול חלקי — היומן עלול להתחיל באמצע. להריץ קודם: git fetch --depth=3000 origin main")
    rows, prev = [], None
    for h, when, subject in commits(RESULTS):
        raw = show(h, RESULTS)
        if not raw:
            continue
        d = json.loads(raw)
        seats = {k: v for k, v in (d.get("seats") or {}).items()}
        key = (d.get("asOf"), d.get("counted"), json.dumps(seats, sort_keys=True))
        if key == prev:
            continue  # שינוי במבנה הקובץ בלי נתון חדש
        prev = key
        csv = show(h, BALLOTS)
        ballots = f"{csv.count(chr(10)) - 1:,}" if csv else "—"
        counted = f"{d['counted']}%" if d.get("counted") is not None else "—"
        valid = f"{d['valid']:,}" if d.get("valid") else "—"
        src = (d.get("source") or "").split("—")[0].strip()
        status = {"none": "אין תוצאות", "partial": "חלקי", "final": "סופי"}.get(d.get("status"), "—")
        rows.append(f"| {when} | {d.get('asOf') or '—'} | {status} | {counted} | {valid} | {ballots} | {src} | {seats_line(seats) or '—'} | `{h}` {subject} |")
    code = [f"| {when} | `{h}` {subject} |" for h, when, subject in commits(*CODE)]
    text = "\n".join([
        "# יומן עדכוני תוצאות 2026",
        "",
        "נבנה אוטומטית מהיסטוריית הריפו (`python3 pipeline/results_log.py`); אין לערוך ידנית. "
        "כל שורה — גרסה של `raw/results-2026.json` שנכנסה לענף הראשי. \"נספרו\" — מתוך כלל בעלי זכות הבחירה; "
        "קלפיות — שורות בקובץ הוועדה לפי קלפי (כולל מעטפות), כשהיה כזה; המנדטים לפי מנוע החוק של האתר.",
        "",
        "## עדכוני התוצאות",
        "",
        "| נכנס לריפו | נכון ל- | מצב | נספרו | כשרים | קלפיות | מקור | מנדטים | שינוי |",
        "|---|---|---|---|---|---|---|---|---|",
        *rows,
        "",
        "## שינויים בקוד החישוב (מנדטים, \"מה השתנה\")",
        "",
        "| נכנס לריפו | שינוי |",
        "|---|---|",
        *code,
        "",
    ])
    OUT.write_text(text, encoding="utf-8")
    print(f"נכתב {OUT.relative_to(ROOT)}: {len(rows)} עדכונים, {len(code)} שינויי קוד")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
