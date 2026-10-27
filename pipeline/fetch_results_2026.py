"""
תוצאות הבחירות 2026 מוויקיפדיה העברית בליל הספירה (הכרעת בעלים 27.10.2026): raw/results-2026.json.
המקור: טבלת "תוצאות" בערך "הבחירות לכנסת העשרים ושש" — קולות לכל רשימה. המנדטים מחושבים במנוע החוק של האתר
(אחוז חסימה, הסכמי עודפים, באדר-עופר — pipeline/bader_ofer.py), לא נלקחים מהטבלה. תווית: "ויקיפדיה — לא אומת".
אין טבלה, אין קולות, או שהחישוב אינו 120 — הקובץ נשאר כמו שהוא.
שימוש: python3 pipeline/fetch_results_2026.py <קובץ wikitext>   (בלי קובץ — מוריד בעצמו)
       python3 pipeline/fetch_results_2026.py --votes <קובץ json>
         קולות שהועתקו ידנית ממקור (סקיל results-update): {"votes": {מזהה רשימה: קולות}, "valid": קולות כשרים או null,
         "counted": אחוז שנספר או null, "source": "...", "status": "partial" | "final"} — המנדטים לפי מנוע החוק, כמו מוויקיפדיה.
       python3 pipeline/fetch_results_2026.py --jdn [קובץ count-live.json]
         הקולות מאתר הברומטר של JDN (elections.jdn.co.il/data/count-live.json, מתוך תוצאות ועדת הבחירות לפי קלפי;
         הכרעת בעלים 27.10.2026). "נספרו" = קלפיות שנספרו מתוך הקלפיות הצפויות. בלי קובץ — מוריד בעצמו.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bader_ofer import allocate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "raw" / "results-2026.json"
TITLE = "הבחירות_לכנסת_העשרים_ושש"
UA = "elections26-results (https://github.com/hopetohelp/26)"

# שמות לזיהוי כל רשימה בשורת הטבלה; הארוך ביותר שנמצא בשורה קובע
ALIASES = {
    "likud": ["הליכוד"], "yashar": ["ישר!"], "together": ["ביחד"], "democrats": ["הדמוקרטים"],
    "yb": ["ישראל ביתנו"], "shas": ['ש"ס'], "utj": ["יהדות התורה"], "otzma": ["עוצמה יהודית"],
    "rzp": ["הציונות הדתית"], "joint": ["הרשימה המשותפת", 'חד"ש'], "raam": ['רע"ם', "הרשימה הערבית המאוחדת"],
    "reservists": ["המילואימניקים", "המפלגה הכלכלית"], "bluewhite": ["כחול לבן"], "amcha": ["עמך ישראל"],
    "haredi_public": ["הציבור החרדי"], "noam": ["נעם"], "code_black": ["צבע שחור"],
}
NUM = re.compile(r"(?<![\d.])(\d{1,3}(?:,\d{3})+|\d{4,})(?![\d.])")


def fetch() -> str:
    url = f"https://he.wikipedia.org/w/index.php?title={urllib.parse.quote(TITLE)}&action=raw"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return r.read().decode("utf-8")


def section(text: str) -> str:
    """החלק "תוצאות" (עד הכותרת הבאה באותה רמה)"""
    m = re.search(r"^==\s*תוצאות\s*==\s*$", text, re.M)
    if not m:
        return ""
    rest = text[m.end():]
    n = re.search(r"^==[^=].*==\s*$", rest, re.M)
    return rest[: n.start()] if n else rest


def clean(cell: str) -> str:
    cell = re.sub(r"\[\[([^|\]]*)\|([^\]]*)\]\]", r"\1 \2", cell)  # [[יעד|טקסט]] ⇐ שניהם (השם המלא בטקסט, הקצר ביעד)
    cell = re.sub(r"\[\[([^\]]*)\]\]", r"\1", cell)
    cell = cell.replace("״", '"')
    cell = re.sub(r"\{\{[^{}]*\}\}", "", cell)
    cell = re.sub(r"<[^>]+>", "", cell)
    return cell


COUNTED = re.compile(r"נספרו\D{0,40}?(\d{1,3}(?:\.\d+)?)\s*(?:%|אחוז)")


def counted_in(text: str) -> float | None:
    """אחוז הקולות שנספרו, כשהערך מציין אותו בפרק התוצאות ("נספרו 5% מהקולות")"""
    m = COUNTED.search(section(text))
    v = float(m.group(1)) if m else None
    return v if v is not None and 0 <= v <= 100 else None


def parse(text: str) -> tuple[dict, int | None]:
    sec = section(text)
    valid = None
    m = re.search(r"הקולות הכשרים[^\n:]*:\s*'*\s*([\d,]+)", sec)
    if m:
        valid = int(m.group(1).replace(",", ""))
    votes: dict[str, int] = {}
    table = sec[sec.find("{|"):] if "{|" in sec else ""
    for row in re.split(r"^\|-", table, flags=re.M):
        cells = [clean(c) for c in re.split(r"\n[|!]|\|\|", "\n" + row) if c.strip()]
        if len(cells) < 3:
            continue
        # הזיהוי — רק בתאי השם (לפני המספרים)
        head = " ".join(c for c in cells if not NUM.search(c))
        best = None
        for lid, names in ALIASES.items():
            for n in names:
                if n in head and (best is None or len(n) > best[1]):
                    best = (lid, len(n))
        if not best or best[0] in votes:
            continue
        nums = [int(x.replace(",", "")) for c in cells for x in NUM.findall(c)]
        nums = [x for x in nums if x >= 1000]
        if nums:
            votes[best[0]] = max(nums)
    return votes, valid


JDN_URL = "https://elections.jdn.co.il/data/count-live.json"
# מזהי הרשימות של JDN ⇐ מזהי האתר (src/data/meta.json lists2026); רשימה שאינה כאן נספרת רק בסך הקולות הכשרים
JDN_IDS = {
    "likud": "likud", "yashar": "yashar", "beyahad": "together", "hademokratim": "democrats", "ndi": "yb",
    "shas": "shas", "yahadut_hatora": "utj", "ozma_yehudit": "otzma", "zionut_datit": "rzp",
    "reshima_meshutefet": "joint", "raam": "raam", "hendel_zeliha_party": "reservists", "ofer_vinter_party": "amcha",
    "mifleget_hazibur_haharedi": "haredi_public", "noam": "noam", "list_נר": "code_black",
}


def from_jdn(d: dict) -> dict | None:
    """count-live.json ⇐ {"votes", "valid", "counted", "source", "status"}; עדיין לא נספר דבר ⇐ None"""
    counted, expected = d.get("counted") or {}, d.get("expected") or {}
    ballots, total = counted.get("ballots") or 0, expected.get("ballots") or 0
    if ballots <= 0 or total <= 0:
        return None
    votes: dict[str, int] = {}
    for p in d.get("parties", []):
        lid = JDN_IDS.get(p.get("id"))
        if lid and int(p.get("votes") or 0) > 0:
            votes[lid] = votes.get(lid, 0) + int(p["votes"])
    final = d.get("status") == "final"
    return {
        "votes": votes,
        "valid": counted.get("valid"),
        "counted": round(min(ballots / total, 1) * 100, 1),
        "source": "ועדת הבחירות המרכזית דרך הברומטר של JDN (קולות) — לא אומת; המנדטים לפי מנוע החוק של האתר",
        "status": "final" if final else "partial",
    }


def write(votes: dict, valid: int | None, source: str, counted: float | None, status: str = "partial") -> int:
    """המנדטים לפי מנוע החוק ⇐ raw/results-2026.json. סך שאינו 120 — הקובץ לא שונה"""
    total = valid if valid and valid >= sum(votes.values()) else sum(votes.values())
    meta = json.loads((ROOT / "src" / "data" / "meta.json").read_text(encoding="utf-8"))
    agreements = [tuple(a["pair"]) for a in meta["agreements2026"]]
    seats = allocate(votes, total, agreements)["seats"]
    seats = {k: seats.get(k, 0) for k in votes}
    data = json.loads(OUT.read_text(encoding="utf-8"))
    if sum(seats.values()) != 120:
        # בספירה זעירה (מעט קלפיות) העיגול עלול לתת 119/121 — המנדטים לא משתנים, רק "נספרו"
        print(f"::warning::חישוב המנדטים אינו 120 ({sum(seats.values())}) — המנדטים לא שונו")
        if counted is not None and data.get("status") != "final":
            data["counted"] = counted
            OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("עודכן רק נספרו:", counted)
        return 0
    if data.get("status") == "final" and status != "final":
        print("התוצאות כבר סופיות — לא דורסים בספירה חלקית")
        return 0
    now = datetime.now(timezone(timedelta(hours=2)))
    data.update(
        status=status,
        asOf=f"{now.day}/{now.month} {now:%H:%M}",
        source=source,
        seats={k: int(v) for k, v in seats.items()},
        pct={k: round(v / total * 100, 2) for k, v in votes.items()},
        counted=counted if counted is not None else data.get("counted"),
    )
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("עודכן:", json.dumps(data["seats"], ensure_ascii=False), "· נספרו:", data["counted"])
    return 0


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--jdn":
        if len(sys.argv) > 2:
            raw = Path(sys.argv[2]).read_text(encoding="utf-8")
        else:
            with urllib.request.urlopen(urllib.request.Request(JDN_URL, headers={"User-Agent": UA}), timeout=60) as r:
                raw = r.read().decode("utf-8")
        src = from_jdn(json.loads(raw))
        if not src or len(src["votes"]) < 5:
            print("JDN: עדיין אין ספירה (או פחות מ-5 רשימות עם קולות) — הקובץ לא שונה")
            return 0
        return write(src["votes"], src["valid"], src["source"], src["counted"], src["status"])
    if len(sys.argv) > 2 and sys.argv[1] == "--votes":
        src = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        votes = {k: int(v) for k, v in src["votes"].items() if int(v) > 0}
        if len(votes) < 5:
            print(f"פחות מ-5 רשימות עם קולות ({len(votes)}) — הקובץ לא שונה")
            return 0
        return write(votes, src.get("valid"), src["source"], src.get("counted"), src.get("status", "partial"))
    text = Path(sys.argv[1]).read_text(encoding="utf-8") if len(sys.argv) > 1 else fetch()
    votes, valid = parse(text)
    if len(votes) < 5:
        print(f"אין עדיין טבלת תוצאות מלאה בוויקיפדיה ({len(votes)} רשימות) — הקובץ לא שונה")
        return 0
    data = json.loads(OUT.read_text(encoding="utf-8"))
    if data.get("status") == "final" and "ויקיפדיה" not in str(data.get("source")):
        print("התוצאות כבר סופיות מוועדת הבחירות — לא דורסים")
        return 0
    return write(votes, valid, "ויקיפדיה העברית (קולות) — לא אומת; המנדטים לפי מנוע החוק של האתר", counted_in(text))


if __name__ == "__main__":
    import urllib.parse  # noqa: F401
    sys.exit(main())
