"""טבלת הכיסוי של תוכנית "אזור ניתוח הבחירות — נתונים מלאים" (04.11.2026).

התוכנית מאמתת את עצמה: הטבלה במסמך נבנית מהקבצים עצמם, לא נכתבת ביד.
  python3 pipeline/plan_coverage.py          — מדפיס את הטבלה
  python3 pipeline/plan_coverage.py --write  — מעדכן את הטבלה במסמך התוכנית (בין הסימונים)
  python3 pipeline/plan_coverage.py --check  — נכשל אם הטבלה במסמך אינה תואמת לקבצים
"""
from __future__ import annotations

import collections
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, DATA = ROOT / "raw", ROOT / "src" / "data"
PLAN = ROOT / "docs" / "תוכנית-נתונים-מלאים-לכל-המערכות-04-11-2026.md"
START, END = "<!-- coverage:start -->", "<!-- coverage:end -->"
ELECTIONS = [(19, "2013"), (20, "2015"), (21, "אפר׳ 2019"), (22, "ספט׳ 2019"), (23, "2020"), (24, "2021"), (25, "2022"), (26, "2026")]
VERIFIED = {"match", "corrected"}  # תואם למקור, או תוקן לפי המקור ונרשם


def load(p: Path, default=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def poll_status() -> dict[int, collections.Counter]:
    out: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    # מה שהאתר מציג: מחזורי history.json (כולל סקרים שנוספו מעבר לקלט המודל ב-raw/forecast/polls.json)
    for c in (load(DATA / "history.json", {}) or {}).get("cycles", []):
        for p in c["polls"]:
            out[int(c["knesset"])][p.get("verificationStatus") or "unverified"] += 1
    for p in (load(DATA / "polls.json", {}) or {}).get("polls", []):
        # הסטטוס עצמו: "אומת" = match/corrected; "הוצלב" (secondary) ו"חלקי" (partial) — בנפרד
        out[26][(p.get("verification") or {}).get("status") or "unverified"] += 1
        if not p.get("urls"):
            out[26]["no_url"] += 1
    return out


def exit_polls() -> dict[int, tuple[int, int]]:
    """מדגמי 22:00: (כמה, כמה אומתו) לכל כנסת. 2026 — raw/exit-polls.json; קודמות — raw/exit-polls-history.json"""
    out: dict[int, list[int]] = collections.defaultdict(lambda: [0, 0])
    for p in load(RAW / "exit-polls.json", []):
        out[26][0] += 1
        out[26][1] += bool(p.get("verified"))
    for p in load(RAW / "exit-polls-history.json", []):
        out[p["knesset"]][0] += 1
        out[p["knesset"]][1] += p.get("status") in VERIFIED
    return {k: (v[0], v[1]) for k, v in out.items()}


def ballot_file(n: int) -> Path | None:
    for p in (RAW / "cec" / f"k{n}_expb.csv", RAW / {25: "ballots-2022.csv", 26: "ballots-2026.csv"}.get(n, "-")):
        if p.exists():
            return p
    return None


def has_committee(p: Path | None) -> bool:
    if p is None:
        return False
    for enc in ("utf-8-sig", "cp1255"):
        try:
            with p.open(encoding=enc) as f:
                return "סמל ועדה" in next(csv.reader(f))
        except (UnicodeDecodeError, StopIteration):
            continue
    return False


def table() -> str:
    st, ex = poll_status(), exit_polls()
    results = {r["knesset"] for r in load(DATA / "results.json", [])} | ({26} if (RAW / "results-2026.json").exists() else set())
    loc = {e["id"] for e in (load(DATA / "localities.json", {}) or {}).get("elections", [])}
    flows = {26} if (DATA / "flow2026.json").exists() else set()
    flows |= {int(p.stem[1:]) for p in (DATA / "flows").glob("k*.json")} if (DATA / "flows").exists() else set()
    yes = lambda b: "✅" if b else "❌"
    rows = ["| מערכת | סקרים: אומתו / סה״כ | סקרים: נבדקו בלי התאמה | מדגמי 22:00: אומתו / סה״כ | תוצאות ארציות באתר | לפי קלפי | לפי ועדה | לפי יישוב באתר | מעבר מצביעים |",
            "|---|---|---|---|---|---|---|---|---|"]
    for n, label in ELECTIONS:
        c = st.get(n, collections.Counter())
        total = sum(v for k, v in c.items() if k != "no_url")
        ok = sum(c[k] for k in VERIFIED)
        other = ", ".join(f"{k} {v}" for k, v in sorted(c.items()) if k not in VERIFIED)
        e = ex.get(n, (0, 0))
        b = ballot_file(n)
        rows.append(f"| {label} | {ok} / {total} | {other or '—'} | {e[1]} / {e[0]} | {yes(n in results)} | {yes(b)} | {yes(has_committee(b))} | {yes(f'k{n}' in loc)} | {yes(n in flows)} |")
    return "\n".join(rows)


def main() -> None:
    t = table()
    if len(sys.argv) == 1:
        print(t)
        return
    doc = PLAN.read_text(encoding="utf-8")
    a, b = doc.index(START) + len(START), doc.index(END)
    if sys.argv[1] == "--write":
        PLAN.write_text(doc[:a] + "\n" + t + "\n" + doc[b:], encoding="utf-8")
        print("updated", PLAN.name)
    elif sys.argv[1] == "--check":
        if doc[a:b].strip() != t.strip():
            print("טבלת הכיסוי במסמך התוכנית אינה תואמת לקבצים. הרץ: python3 pipeline/plan_coverage.py --write")
            sys.exit(1)
        print("coverage table up to date")


if __name__ == "__main__":
    main()
