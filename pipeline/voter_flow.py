"""מעבר מצביעים 2022 ⇐ 2026, לפי השוואת כל קלפי לאותה קלפי.

    python3 pipeline/voter_flow.py

קלט: raw/ballots-2022.csv (תוצאות האמת לפי קלפי, data.gov.il) ו-raw/ballots-2026.csv (ועדת הבחירות, לפי קלפי).
פלט: src/data/flow2026.json.

השיטה:
1. אותה קלפי = אותו סמל יישוב ואותו מספר קלפי בשתי המערכות (הכרעת בעלים 28.10.2026: קלפי תמיד נשארת אותה קלפי,
   בלי תנאי על מספר בעלי זכות הבחירה או אחוז ההצבעה).
2. לכל קלפי: הקולות של כל רשימה ב-2022 (כולל "לא הצביעו") ושל כל רשימה ב-2026 (כולל "לא הצביעו").
3. מטריצת מעבר אחת לכל הארץ: איזה חלק ממצביעי כל רשימה של 2022 הצביע לכל רשימה של 2026, כך שתחזית
   כל הקלפיות תהיה הקרובה ביותר לתוצאה בכל קלפי (עדכונים כפליים של מרחק KL; כל שורה מסתכמת ב-1).
אין שימוש בסקרים, בשיוך ידני או במודל — רק בקלפיות.
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
B22, B26 = ROOT / "raw" / "ballots-2022.csv", ROOT / "raw" / "ballots-2026.csv"
OUT = ROOT / "src" / "data" / "flow2026.json"

# הרשימות שעברו את אחוז החסימה ב-2022, ומרצ ובל"ד (מעל 2.5%); השאר ⇐ "other"
OLD = ["מחל", "פה", "ט", "כן", "שס", "ג", "ל", "עם", "ום", "אמת", "מרצ", "ד", "ב"]
# אותיות 2026 ⇐ מזהה ב-src/data/meta.json lists2026 (לפי מזהי JDN ב-fetch_results_2026.py)
NEW = {"מחל": "likud", "דרך": "yashar", "ודם": "joint", "רק": "together", "אמת": "democrats", "ג": "utj", "ל": "yb",
       "ב": "otzma", "שס": "shas", "ט": "rzp", "עם": "raam", "די": "reservists", "ך": "amcha",
       "נר": "code_black", "זך": "haredi_public", "ני": "noam"}
ITERATIONS = 400


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def key(row: dict) -> tuple[int, float]:
    return int(row["סמל ישוב"]), float(row["קלפי"])


def n(row: dict, k: str) -> int:
    return int(float(row.get(k) or 0))


def vector(row: dict, letters: list[str]) -> list[int]:
    v = [n(row, k) for k in letters]
    return v + [n(row, "כשרים") - sum(v), n(row, "בזב") - n(row, "מצביעים")]


def build() -> dict:
    r22, r26 = read(B22), read(B26)
    by22 = {key(x): x for x in r22}
    new = list(NEW)
    pairs, matched_valid = [], 0
    for y in r26:
        x = by22.get(key(y))
        if not x:
            continue
        pairs.append((vector(x, OLD), vector(y, new)))
        matched_valid += n(y, "כשרים")
    I, J = len(OLD) + 2, len(new) + 2
    P = [[1 / J] * J for _ in range(I)]
    for _ in range(ITERATIONS):
        num, den = [[0.0] * J for _ in range(I)], [0.0] * I
        for xs, ys in pairs:
            yh = [sum(xs[i] * P[i][j] for i in range(I)) or 1e-9 for j in range(J)]
            rt = [ys[j] / yh[j] for j in range(J)]
            for i in range(I):
                if xs[i]:
                    den[i] += xs[i]
                    for j in range(J):
                        num[i][j] += xs[i] * rt[j]
        P = [[P[i][j] * num[i][j] / den[i] if den[i] else P[i][j] for j in range(J)] for i in range(I)]
        P = [[v / sum(row) for v in row] for row in P]
    base = [sum(xs[i] for xs, _ in pairs) for i in range(I)]
    # הקולות (בקלפיות הזהות) שעברו מכל רשימה של 2022 לכל רשימה של 2026
    flows = [[round(base[i] * P[i][j]) for j in range(J)] for i in range(I)]
    now = datetime.now(timezone(timedelta(hours=2)))
    return {
        "asOf": f"{now.day}/{now.month}/{now.year}",
        "old": OLD + ["other", "abstain"],
        "new": list(NEW.values()) + ["other", "abstain"],
        "flows": flows,
        "ballots": len(pairs),
        "ballots2026": len(r26),
        "matchedValid": matched_valid,
        "valid2026": sum(n(y, "כשרים") for y in r26),
        "eligible2022": sum(n(x, "בזב") for x in r22),
        "valid2022": sum(n(x, "כשרים") for x in r22),
    }


def main() -> int:
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"נכתב {OUT.relative_to(ROOT)}: {data['ballots']} קלפיות שהיו גם ב-2022, מתוך {data['ballots2026']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
