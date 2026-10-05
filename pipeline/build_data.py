"""בונה את קבצי הנתונים של האתר (src/data/*.json) מחומר הגלם שב-raw/.

הרצה: python3 pipeline/build_data.py
הפלט דטרמיניסטי: אותו גלם ⇐ אותו פלט (מפתחות ממוינים, בלי חותמת זמן של ההרצה).
"""
from __future__ import annotations

import csv
import hashlib
import html
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "src" / "data"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import wiki_tables as wt  # noqa: E402
from bader_ofer import allocate  # noqa: E402

ISRAEL_TZ = timezone(timedelta(hours=3))  # שעון קיץ עד 25.10.2026; ההקפאה מחושבת ברגעים מוחלטים בהמשך
# 16ה(ח): מתום יום שישי שלפני הבחירות ועד סגירת הקלפיות (25.10 — מעבר לשעון חורף, ולכן +02:00 בסוף)
FREEZE_START = datetime.fromisoformat("2026-10-24T00:00:00+03:00")
FREEZE_END = datetime.fromisoformat("2026-10-27T22:00:00+02:00")
# מהבנייה של יום שישי בצהריים ואילך — באנר "לא עדכני" קבוע, בלי תלות בשעון הדפדפן
FROZEN_FROM = FREEZE_START - timedelta(hours=12)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------- תוצאות רשמיות

ELECTIONS = {
    21: {"date": "2019-04-09", "label": "אפריל 2019"},
    22: {"date": "2019-09-17", "label": "ספטמבר 2019"},
    23: {"date": "2020-03-02", "label": "מרץ 2020"},
    24: {"date": "2021-03-23", "label": "מרץ 2021"},
    25: {"date": "2022-11-01", "label": "נובמבר 2022"},
}

# שמות קצרים לתצוגה (השם הרשמי המלא נשמר בשדה name)
SHORT = {
    25: {"מחל": "הליכוד", "פה": "יש עתיד", "ט": "הציונות הדתית", "כן": "המחנה הממלכתי", "שס": 'ש"ס',
         "ג": "יהדות התורה", "ל": "ישראל ביתנו", "עם": 'רע"ם', "ום": 'חד"ש-תע"ל', "אמת": "העבודה",
         "מרצ": "מרצ", "ד": 'בל"ד', "ב": "הבית היהודי", "אצ": "חופש כלכלי", "יז": "הכלכלית החדשה"},
    24: {"מחל": "הליכוד", "פה": "יש עתיד", "שס": 'ש"ס', "כן": "כחול לבן", "ב": "ימינה", "אמת": "העבודה",
         "ג": "יהדות התורה", "ל": "ישראל ביתנו", "ט": "הציונות הדתית", "ודעם": "הרשימה המשותפת",
         "ת": "תקווה חדשה", "מרצ": "מרצ", "עם": 'רע"ם', "יז": "הכלכלית החדשה"},
    23: {"מחל": "הליכוד", "פה": "כחול לבן", "ודעם": "הרשימה המשותפת", "שס": 'ש"ס', "ג": "יהדות התורה",
         "אמת": "העבודה-גשר-מרצ", "ל": "ישראל ביתנו", "טב": "ימינה", "נץ": "עוצמה יהודית"},
    22: {"פה": "כחול לבן", "מחל": "הליכוד", "ודעם": "הרשימה המשותפת", "שס": 'ש"ס', "ל": "ישראל ביתנו",
         "ג": "יהדות התורה", "טב": "ימינה", "אמת": "העבודה-גשר", "מרצ": "המחנה הדמוקרטי", "כף": "עוצמה יהודית"},
    21: {"מחל": "הליכוד", "פה": "כחול לבן", "שס": 'ש"ס', "ג": "יהדות התורה", "ום": 'חד"ש-תע"ל',
         "אמת": "העבודה", "ל": "ישראל ביתנו", "טב": "איחוד מפלגות הימין", "מרצ": "מרצ", "כ": "כולנו",
         "דעם": 'רע"ם-בל"ד', "נ": "הימין החדש", "ז": "זהות", "נר": "גשר"},
}

# הסכמי עודפים (מקור: ויקיפדיה העברית, ערכי הבחירות; לכנסת 21 — הודעת ועדת הבחירות דרך ארכיון האינטרנט)
AGREEMENTS = {
    21: [["אמת", "מרצ"], ["נ", "ל"], ["דעם", "ום"], ["מחל", "טב"], ["שס", "ג"]],
    22: [["פה", "ל"], ["מחל", "טב"], ["אמת", "מרצ"], ["ג", "שס"]],
    23: [["מחל", "טב"], ["פה", "אמת"], ["ג", "שס"]],
    24: [["ב", "ת"], ["פה", "ל"], ["כן", "יז"], ["מחל", "ט"], ["אמת", "מרצ"], ["שס", "ג"]],
    25: [["פה", "כן"], ["אמת", "מרצ"], ["שס", "ג"], ["מחל", "ט"]],
}


def parse_national(n: int) -> dict:
    path = RAW / "cec" / f"k{n}_nationalresults.html"
    text = path.read_text(encoding="utf-8", errors="replace")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S)
    cells_rows = [[html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                   for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)] for r in rows]
    num = lambda s: int(s.replace(",", ""))  # noqa: E731
    totals = cells_rows[1]
    lists = []
    for c in cells_rows:
        if len(c) == 5 and re.match(r'^[֐-׿"]+$', c[1] or "") and c[2].isdigit():
            name = re.sub(r"\s+", " ", c[0]).replace("`", "'")
            lists.append({"letters": c[1], "name": name, "short": SHORT[n].get(c[1], name.split(" בראשות")[0][:40]),
                          "votes": num(c[4]), "seats": int(c[2])})
    return {"eligible": num(totals[0]), "voted": num(totals[1]), "valid": num(totals[3]),
            "invalid": num(totals[4]), "lists": lists, "sha256": sha256(path)}


def build_results() -> list[dict]:
    out = []
    for n, meta in ELECTIONS.items():
        r = parse_national(n)
        votes = {l["letters"]: l["votes"] for l in r["lists"]}
        official = {l["letters"]: l["seats"] for l in r["lists"] if l["seats"]}
        calc = allocate(votes, r["valid"], [tuple(a) for a in AGREEMENTS[n]])
        if calc["seats"] != official:
            raise SystemExit(f"K{n}: המנוע אינו משחזר את התוצאה הרשמית: {calc['seats']} מול {official}")
        out.append({
            "id": f"k{n}", "knesset": n, "date": meta["date"], "label": meta["label"],
            "eligible": r["eligible"], "voted": r["voted"], "valid": r["valid"], "invalid": r["invalid"],
            "lists": sorted(r["lists"], key=lambda l: -l["votes"]),
            "agreements": AGREEMENTS[n],
            "source": {"url": f"https://votes{n}.bechirot.gov.il/nationalresults", "sha256": r["sha256"],
                       "agreementsSource": "ויקיפדיה העברית, ערך הבחירות לכנסת ה-%d, פרק הסכמי עודפים" % n},
        })
    return out


# ---------------------------------------------------------------- סקרים

# מפתח העמודה בוויקיפדיה ⇐ מזהה קבוע אצלנו
PARTY_KEY = {
    "Likud": "likud", "Together (Israel)": "together", "Together": "together",
    "Yashar (political party)": "yashar", "Yashar": "yashar",
    "Religious Zionist Party": "rzp", "RZP": "rzp", "Religious Zionist Party+Zehut": "rzp", "Zehut": "zehut",
    "Otzma Yehudit": "otzma", "Otzma": "otzma", "Religious Zionist Party+Otzma Yehudit": "rzp_otzma",
    "Shas": "shas", "United Torah Judaism": "utj", "UTJ": "utj", "Yisrael Beiteinu": "yb",
    "Blue and White (political party)": "bluewhite", "Blue & White": "bluewhite",
    "National Unity (Israel)": "national_unity",
    "The Democrats (Israel)": "democrats", "Dems": "democrats",
    "Israeli Labor Party": "labor", "Meretz": "meretz", "Israeli Labor Party+Meretz": "labor_meretz",
    "United Arab List": "raam", "Ra'am": "raam",
    "Joint List": "joint", "Hadash–Ta'al+Balad (political party)": "joint",
    "Hadash–Ta'al": "hadash_taal", "Balad (political party)": "balad",
    "United Arab List+Hadash–Ta'al+Balad (political party)": "joint_with_raam",
    "United Arab List+Hadash–Ta'al": "raam_hadash_taal",
    "The Reservists (political party)+New Economic Party": "reservists",
    "The Reservists (political party)": "reservists", "Reserv.": "reservists",
    "Zionist Home – The Reservists": "reservists", "New Economic Party": "nep",
    "Amcha Yisrael": "amcha", "Winter party": "amcha", "Haredi Public": "haredi_public",
    "Yesh Atid": "yesh_atid", "Bennett 2026": "bennett", "Bennett party": "bennett",
    "New Hope (Israel)": "new_hope", "Unity (Israel)": "unity",
}
SKIP_KEYS = {"Gov.", "Lead", "Others", "Opp."}

FIRM_HE = {
    "Kantar": "קנטר", "Direct Polls": "דיירקט פולס", "SF+ND": "שלמה פילבר + NEXT DATA", "Filber": "שלמה פילבר",
    "Yossi Tatika": "יוסי טטיקה", "LRI+P4A": "לזר מחקרים + Panel4All", "Lazar": "לזר מחקרים",
    "MP+TM+SN+A": "מדגם, המדד, סטטנט ואסקריה", "Maagar Mochot": "מאגר מוחות", "MM+SN": "מאגר מוחות + סטטנט",
    "Midgam R&C": "מדגם מחקר וייעוץ", "Midgam Project": "פרויקט מדגם", "TrendZone": "טרנדזון",
    "Panels Politics": "פאנלס פוליטיקס", "CF+MP+SN": "קמיל פוקס, פרויקט מדגם וסטטנט", "Camil Fuchs": "קמיל פוקס",
    "Smith": "סמית'", "Statnet": "סטטנט", "SF+DP": "שלמה פילבר + דיירקט פולס", "Smith Consulting": "סמית'",
    "Midgam Project & Stat Net": "פרויקט מדגם וסטטנט", "Timor Group": "קבוצת טימור",
}
PUB_HE = {
    "Kan 11": "כאן 11", "i24 News": "i24NEWS", "Channel 14": "ערוץ 14", "Zman Yisrael": "זמן ישראל",
    "Maariv": "מעריב", "Channel 13": "חדשות 13", "Channel 16": "ערוץ 16", "HaHadashot 12": "חדשות 12",
    "Channel 12": "חדשות 12", "Walla": "וואלה", "Israel Hayom": "ישראל היום", "Channel 11": "כאן 11",
    "103FM": "103FM", "Makor Rishon": "מקור ראשון", "Zman Israel": "זמן ישראל",
    "The Times of Israel": "טיימס אוף ישראל", "The Jerusalem Post": "ג'רוזלם פוסט", "Arutz Sheva": "ערוץ 7",
    "Amit Segal": "עמית סגל (טלגרם)", "The Truth Machine": "מכונת האמת",
}
# שמות מותגים שנכתבים באותיות לטיניות גם בעברית; כל שם אחר באנגלית בממשק הוא תרגום חסר
LATIN_BRANDS = ("NEXT DATA", "Panel4All", "i24NEWS", "103FM", "DRI", "HOT")


def untranslated(name: str | None) -> bool:
    if not name:
        return False
    for brand in LATIN_BRANDS:
        name = name.replace(brand, "")
    return bool(re.search(r"[A-Za-z]", name))

POLL_FILES = [
    "en__2022–2023_opinion_polling_for_the_2026_Israeli_legislative_election.wiki",
    "en__2024_opinion_polling_for_the_2026_Israeli_legislative_election.wiki",
    "en__2025_opinion_polling_for_the_2026_Israeli_legislative_election.wiki",
    "en__Opinion_polling_for_the_2026_Israeli_legislative_election.wiki",
]
STANDARD_TABLE_LIMIT = 6087  # בדף 2026: טבלאות המנדטים הרגילות לפני פרק האחוזים/התרחישים


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "x"


def clean_publisher(p: str | None) -> str | None:
    if not p:
        return p
    p = re.sub(r"\{\{[^}]*\}\}", "", p)
    # שאריות עריכה בוויקיפדיה: "|" כפול בתחילת התא, מקף במקום "אין מזמין"
    p = re.sub(r"<ref.*", "", p).strip(" '\"|`")
    return None if p in ("", "–", "-", "—") else p


def clean_firm(f: str | None) -> str:
    return (f or "").strip(" '\"|`")


def is_not_a_poll(firm: str | None) -> bool:
    """שורת תוצאות בחירות, מדגם קלפיות או מצב הכנסת היוצאת — יושבות בטבלאות הסקרים אבל אינן סקר."""
    return bool(re.search(r"legislative election|election results?|exit poll|pre-election seats|outgoing knesset",
                          firm or "", re.I))


def build_polls(build_time: datetime) -> dict:
    polls, seen_ids = [], {}
    for fname in POLL_FILES:
        path = RAW / "wikipedia" / fname
        text = path.read_text(encoding="utf-8")
        page_sha = sha256(path)
        for pos, table in wt.tables(text):
            line = text[:pos].count("\n") + 1
            if fname.startswith("en__Opinion_polling") and line >= STANDARD_TABLE_LIMIT:
                continue
            res = wt.parse_table(table)
            if not res:
                continue
            for d in res[1]:
                if d["type"] != "poll" or not d.get("date") or is_not_a_poll(d.get("firm")):
                    continue
                urls = d["urls"]
                values, joint_cols, others, gov = {}, [], None, None
                for k, v in d["values"].items():
                    if k == "Others":
                        others = v
                        continue
                    if k.startswith("Gov"):
                        gov = v.get("seats")
                        continue
                    if k in SKIP_KEYS or k.startswith("Lead"):
                        continue
                    pid = PARTY_KEY.get(k)
                    if not pid:
                        joint_cols.append(k)
                        continue
                    entry = {}
                    if "seats" in v:
                        entry["s"] = v["seats"]
                    elif "pct" in v:
                        entry["p"] = v["pct"]
                    else:
                        continue
                    values[pid] = entry
                seat_sum = sum(e.get("s", 0) for e in values.values())
                firm = clean_firm(d.get("firm"))
                pub = clean_publisher(d.get("publisher"))
                base = f"{d['date']['end']}-{slug(firm)}-{slug(pub)}"
                n = seen_ids.get(base, 0)
                seen_ids[base] = n + 1
                pid_ = base if n == 0 else f"{base}-{chr(ord('a') + n)}"
                assumed_pub = datetime.fromisoformat(d["date"]["end"] + "T20:00:00").replace(tzinfo=ISRAEL_TZ)
                if FREEZE_START <= assumed_pub < FREEZE_END:
                    continue  # 16ה(ח): סקר שפורסם לראשונה בתקופת האיסור — לא נכנס בשום מקרה
                polls.append({
                    "id": pid_, "start": d["date"]["start"], "end": d["date"]["end"],
                    "firm": firm, "firmHe": FIRM_HE.get(firm, firm), "publisher": pub,
                    "publisherHe": PUB_HE.get(pub or "", pub), "sample": d.get("sample"),
                    "values": values, "others": others, "gov": gov,
                    "seatSum": seat_sum, "consistent": 118 <= seat_sum <= 122,
                    "unmapped": joint_cols,
                    "urls": urls[:3],
                    "assumedPublishedAt": assumed_pub.isoformat(),
                    "eligibleToShow": assumed_pub + timedelta(hours=24) <= build_time,
                    "source": {"page": fname.replace("en__", "").replace(".wiki", "").replace("_", " "),
                               "sha256": page_sha, "tableLine": line},
                    "verified": False,
                })
    polls.sort(key=lambda p: (p["end"], p["id"]), reverse=True)
    return {"polls": polls}


# ---------------------------------------------------------------- תיקונים ואימות מול המקור

def apply_corrections(polls: list[dict], build_time: datetime) -> None:
    """raw/corrections.json: תיקון שדה לפי הפרסום המקורי. אף פעם לא בשקט — נרשם ב-poll["corrections"].
    אם הערך הנוכחי אינו הערך שממנו תיקנו ("from"), הבנייה נכשלת: המקור השתנה ויש לבדוק מחדש."""
    path = RAW / "corrections.json"
    if not path.exists():
        return
    by_id = {p["id"]: p for p in polls}
    for c in json.loads(path.read_text(encoding="utf-8")):
        p = by_id.get(c["id"])
        if p is None:
            raise SystemExit(f"תיקון לסקר שאינו קיים: {c['id']}")
        parts = c["field"].split(".")
        holder = p
        for k in parts[:-1]:
            if k == "others" and holder.get("others") is None:
                holder["others"] = {}
            holder = holder.setdefault(k, {})
        last = {"s": "s", "p": "p", "pct": "pct"}.get(parts[-1], parts[-1])
        current = holder.get(last)
        if current != c["from"]:
            raise SystemExit(f"תיקון {c['id']} {c['field']}: הערך הנוכחי {current!r} אינו {c['from']!r} — המקור השתנה")
        holder[last] = c["to"]
        p.setdefault("corrections", []).append({"field": c["field"], "from": c["from"], "to": c["to"], "source": c["source"]})
    for p in polls:
        if not p.get("corrections"):
            continue
        p["seatSum"] = sum(e.get("s", 0) for e in p["values"].values())
        p["consistent"] = 118 <= p["seatSum"] <= 122
        assumed = datetime.fromisoformat(p["end"] + "T20:00:00").replace(tzinfo=ISRAEL_TZ)
        p["assumedPublishedAt"] = assumed.isoformat()
        p["eligibleToShow"] = assumed + timedelta(hours=24) <= build_time


def apply_verification(polls: list[dict]) -> None:
    """raw/verification.json: תוצאת ההשוואה לפרסום המקורי לכל סקר שנבדק."""
    path = RAW / "verification.json"
    if not path.exists():
        return
    by_id = {v["id"]: v for v in json.loads(path.read_text(encoding="utf-8"))}
    for p in polls:
        v = by_id.get(p["id"])
        if not v:
            continue
        status = v["status"]
        if status == "mismatch" and p.get("corrections"):
            status = "corrected"
        p["verified"] = status in ("match", "corrected", "partial")
        p["verification"] = {"status": status, "checkedAt": v["checkedAt"], "source": v.get("source"),
                             "details": v.get("sourceDetails") or {}, "law16E": v.get("law16E") or {}}


# ---------------------------------------------------------------- רשימות 2026

LISTS_2026 = [
    {"id": "likud", "name": "הליכוד", "leader": "בנימין נתניהו", "gov37": True},
    {"id": "yashar", "name": "ישר!", "leader": "גדי איזנקוט", "gov37": False},
    {"id": "together", "name": "ביחד", "leader": "נפתלי בנט (עם יאיר לפיד)", "gov37": False},
    {"id": "democrats", "name": "הדמוקרטים", "leader": "יאיר גולן", "gov37": False},
    {"id": "yb", "name": "ישראל ביתנו", "leader": "אביגדור ליברמן", "gov37": False},
    {"id": "shas", "name": 'ש"ס', "leader": "אריה דרעי", "gov37": True},
    {"id": "utj", "name": "יהדות התורה", "leader": "", "gov37": True},
    {"id": "otzma", "name": "עוצמה יהודית", "leader": "איתמר בן גביר", "gov37": True},
    {"id": "rzp", "name": "הציונות הדתית-זהות", "leader": "בצלאל סמוטריץ' ומשה פייגלין", "gov37": True},
    {"id": "joint", "name": "הרשימה המשותפת", "leader": 'חד"ש, תע"ל, בל"ד', "gov37": False},
    {"id": "raam", "name": 'רע"ם', "leader": "מנסור עבאס", "gov37": False},
    {"id": "reservists", "name": "המילואימניקים-הכלכלית", "leader": "יועז הנדל וירון זליכה", "gov37": False},
    {"id": "bluewhite", "name": "כחול לבן", "leader": "בני גנץ", "gov37": False},
    {"id": "amcha", "name": "עמך ישראל", "leader": "עופר וינטר", "gov37": False},
    {"id": "haredi_public", "name": "הציבור החרדי", "leader": "", "gov37": False},
]
# הסכמי עודפים לכנסת ה-26 — כפי שדווחו בתקשורת; רשמיים רק אחרי פרסום הוועדה (19.10.2026)
AGREEMENTS_2026 = [
    {"pair": ["likud", "rzp"], "status": "reported", "source": "ויקיפדיה העברית; מעריב, 9.9.2026"},
    {"pair": ["together", "yb"], "status": "reported", "source": "ויקיפדיה העברית; ynet, 10.9.2026"},
    {"pair": ["yashar", "democrats"], "status": "reported", "source": "ויקיפדיה העברית; ynet, 10.9.2026"},
    {"pair": ["raam", "joint"], "status": "reported", "source": "ויקיפדיה העברית; ynet, 11.9.2026"},
    {"pair": ["shas", "utj"], "status": "reported_single_source", "source": "JDN (מקור יחיד, טרם אומת)"},
]

HISTORY_NAMES = {
    "yesh_atid": "יש עתיד", "bennett": "בנט 2026", "national_unity": "המחנה הממלכתי", "labor": "העבודה",
    "meretz": "מרצ", "hadash_taal": 'חד"ש-תע"ל', "balad": 'בל"ד', "joint_with_raam": 'המשותפת עם רע"ם',
    "new_hope": "תקווה חדשה", "zehut": "זהות", "nep": "הכלכלית החדשה", "unity": "האחדות",
    "rzp_otzma": "הציונות הדתית + עוצמה", "labor_meretz": "העבודה + מרצ", "raam_hadash_taal": 'רע"ם + חד"ש-תע"ל',
}

# ---------------------------------------------------------------- סקרי המערכות הקודמות (דיוק הסקרים)

# לכל מערכת: הטבלה הראשית בדף הסקרים שלה — מהגשת הרשימות ועד הבחירות, כלומר סקרים על הרשימות שעמדו בפועל לבחירה.
# "cols": עמודת ויקיפדיה ⇐ אותיות הרשימה בתוצאות הרשמיות; "ignore": עמודות שאינן רשימה בקלפי (גוש, "אחרות",
# רשימה שפרשה לפני הבחירות). עמודה שאינה באף אחד מהשניים מפילה את הבנייה — כדי ששום מספר לא ייוחס לרשימה הלא נכונה.
HISTORY = {
    21: {"page": "en__Opinion_polling_for_the_April_2019_Israeli_legislative_election.wiki", "combined": True,
         "cols": {"Likud": "מחל", "Israeli Labor Party": "אמת", "Blue and White (political alliance)": "פה",
                  "Kulanu": "כ", "United Arab List": "דעם", "Shas": "שס", "United Torah Judaism": "ג",
                  "Union of Right-Wing Parties": "טב", "Yisrael Beiteinu": "ל", "Meretz": "מרצ", "Hadash": "ום",
                  "New Right (Israel)": "נ", "Gesher (2019 political party)": "נר", "Zehut": "ז"},
         "ignore": {"L", "R"}},
    22: {"page": "en__Opinion_polling_for_the_September_2019_Israeli_legislative_election.wiki",
         "cols": {"Likud": "מחל", "Blue and White (political alliance)": "פה", "Joint List": "ודעם", "Shas": "שס",
                  "United Torah Judaism": "ג", "Yamina": "טב", "Israeli Labor Party": "אמת", "Yisrael Beiteinu": "ל",
                  "Democratic Union (Israel)": "מרצ", "Otzma Yehudit": "כף"},
         "ignore": {"Gov.", "Zehut"}},  # זהות פרשה ב-29.8.2019 ולא הופיעה בקלפי
    23: {"page": "en__Opinion_polling_for_the_2020_Israeli_legislative_election.wiki",
         "cols": {"Blue and White (political alliance)": "פה", "Likud": "מחל", "Joint List": "ודעם",
                  "Israeli Labor Party": "אמת", "Shas": "שס", "Yisrael Beiteinu": "ל", "United Torah Judaism": "ג",
                  "Yamina": "טב", "Otzma": "נץ"},
         "ignore": {"Gov."}},
    24: {"page": "en__Opinion_polling_for_the_2021_Israeli_legislative_election.wiki",
         "cols": {"Likud": "מחל", "Yesh Atid": "פה", "Blue and White (political alliance)": "כן", "Joint List": "ודעם",
                  "Shas": "שס", "United Torah Judaism": "ג", "Yisrael Beiteinu": "ל", "Meretz": "מרצ",
                  "United Arab List": "עם", "Yamina": "ב", "New Hope": "ת", "Israeli Labor Party": "אמת",
                  "Religious Zionist": "ט", "New Economic": "יז"},
         "ignore": set()},
    25: {"page": "en__Opinion_polling_for_the_2022_Israeli_legislative_election.wiki",
         "cols": {"Likud": "מחל", "Yesh Atid": "פה", "National Unity Party (Israel)": "כן", "Shas": "שס",
                  "The Jewish Home": "ב", "Israeli Labor Party": "אמת", "United Torah Judaism": "ג",
                  "Yisrael Beiteinu": "ל", "Religious Zionist Party": "ט", "Hadash–Ta'al": "ום", "Meretz": "מרצ",
                  "United Arab List": "עם", "Balad (political party)": "ד"},
         "ignore": {"Others", "Gov.", "Opp."}},
}
# הרשימות שהמליצו על בנימין נתניהו לנשיא המדינה בהתייעצויות שאחרי כל מערכת — עובדה, לא סיווג אידאולוגי.
# 21: 65 ח"כים · 22: 55 · 23: 58 · 24: 52 · 25: 64 (ויקיפדיה העברית, ערכי הבחירות; דיווחי התקשורת על ההתייעצויות)
RECOMMENDED_NETANYAHU = {
    21: ["מחל", "שס", "ג", "ל", "טב", "כ"],
    22: ["מחל", "שס", "ג", "טב"],
    23: ["מחל", "שס", "ג", "טב"],
    24: ["מחל", "שס", "ג", "ט"],
    25: ["מחל", "ט", "שס", "ג"],
}

# שמות המכונים והמזמינים בטבלאות הישנות — לפי צורה מנורמלת (אותיות קטנות, בלי פיסוק). מפתח המכון משותף לכל
# המערכות, כדי שאפשר יהיה להשוות מכון לאורך זמן. שם שאינו כאן מפיל את הבנייה (אין שם באנגלית בממשק).
HIST_FIRMS = {
    "midgam": ("midgam", "מדגם מחקר וייעוץ"), "midgam ipanel": ("midgam", "מדגם מחקר וייעוץ"),
    "panel project hamidgam": ("midgam_project", "פרויקט מדגם"),
    "panel hamidgam project": ("midgam_project", "פרויקט מדגם"),
    "maagar mohot": ("maagar_mochot", "מאגר מוחות"), "maagar mochot": ("maagar_mochot", "מאגר מוחות"),
    "kantar": ("kantar", "קנטר"), "tns": ("kantar", "קנטר"),
    "smith": ("smith", "סמית'"), "panels politics": ("panels_politics", "פאנלס פוליטיקס"),
    "direct polls": ("direct_polls", "דיירקט פולס"),
    "camil fuchs": ("camil_fuchs", "קמיל פוקס"), "camile fuchs": ("camil_fuchs", "קמיל פוקס"),
    "dialog": ("dialog", "דיאלוג"), "miskar": ("miskar", "מסקר"),
    "shvakim panorama": ("shvakim_panorama", "שווקים פנורמה"),
    "number 10 strategies": ("number_10", "נאמבר 10 סטרטג'יז"),
}
HIST_PARTNERS = {"statnet", "ipanel"}  # שותפי שטח שמופיעים בתא המכון ("Midgam/iPanel/Channel 12")
HIST_PUBS = {
    "channel 13": "חדשות 13", "channel 12": "חדשות 12", "hahadashot 12": "חדשות 12", "keshet": "חדשות 12",
    "kan": "כאן 11", "kan 11": "כאן 11", "channel 11": "כאן 11", "reshet bet": "כאן — רשת ב'",
    "maariv": "מעריב", "jerusalem post": "ג'רוזלם פוסט", "the jerusalem post": "ג'רוזלם פוסט",
    "yedioth ahronoth": "ידיעות אחרונות", "yediot ahronot": "ידיעות אחרונות",
    "israel hayom": "ישראל היום", "israel hayom i24 news": "ישראל היום ו-i24NEWS",
    "radio 103fm": "103FM", "radio 103 fm": "103FM", "103fm": "103FM",
    "radio 103fm maariv": "103FM ומעריב", "103fm maariv": "103FM ומעריב",
    "walla": "וואלה", "walla news": "וואלה", "haaretz": "הארץ",
    "army radio": 'גלי צה"ל', "galei tzahal": 'גלי צה"ל', "channel 20": "ערוץ 20", "makor rishon": "מקור ראשון",
    "the times of israel": "טיימס אוף ישראל", "knesset channel": "ערוץ הכנסת", "hot": "HOT",
    "arutz sheva": "ערוץ 7", "mako": "מאקו", "galei israel": "גלי ישראל", "mako knesset channel": "מאקו וערוץ הכנסת",
    "channel 14": "ערוץ 14", "maariv the jerusalem post": "מעריב וג'רוזלם פוסט",
    "the jerusalem post maariv": "מעריב וג'רוזלם פוסט",
}


def norm_name(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def hist_firm_pub(firm: str, pub: str | None, combined: bool) -> tuple[str, str, str, str | None]:
    """מחזיר (מפתח מכון, שם המכון בעברית, מפתח מזמין, שם המזמין בעברית).
    ב-2019א המכון והמזמין יושבים באותו תא: "Smith/Maariv", "Midgam/iPanel/Channel 12"."""
    if combined:
        parts = [p.strip() for p in firm.split("/") if p.strip()]
        firm = parts[0]
        pubs = [p for p in parts[1:] if norm_name(p) not in HIST_PARTNERS]
        pub = "/".join(pubs) or None
    key = norm_name(firm)
    if key not in HIST_FIRMS:
        raise SystemExit(f"מכון סקרים בלי שם בעברית: {firm!r} — להוסיף ל-HIST_FIRMS")
    pk = norm_name(pub)
    if pk and pk not in HIST_PUBS:
        raise SystemExit(f"גוף מזמין בלי שם בעברית: {pub!r} — להוסיף ל-HIST_PUBS")
    return (*HIST_FIRMS[key], pk, HIST_PUBS.get(pk))


def build_history(results: list[dict]) -> dict:
    by_n = {r["knesset"]: r for r in results}
    cycles = []
    for n, cfg in HISTORY.items():
        election = by_n[n]
        path = RAW / "wikipedia" / cfg["page"]
        text = path.read_text(encoding="utf-8")
        pos, table = wt.tables(text)[0]  # הטבלה הראשונה בדף = מהגשת הרשימות ועד יום הבחירות
        res = wt.parse_table(table)
        letters_on_ballot = {l["letters"] for l in election["lists"]}
        for letters in cfg["cols"].values():
            if letters not in letters_on_ballot:
                raise SystemExit(f"K{n}: האותיות {letters} אינן בתוצאות הרשמיות")
        polls, seen = [], {}
        for d in res[1]:
            if d["type"] != "poll" or is_not_a_poll(d.get("firm")):
                continue
            if not d.get("date"):
                raise SystemExit(f"K{n}: שורת סקר בלי תאריך: {d.get('firm')!r}")
            if d["date"]["end"] >= election["date"]:
                continue  # מדגמי הקלפיות של ערב הבחירות אינם סקר מוקדם
            values = {}
            for k, v in d["values"].items():
                parts = k.split("+")
                if all(p in cfg["ignore"] for p in parts):
                    continue
                if len(parts) != 1 or k not in cfg["cols"]:
                    raise SystemExit(f"K{n}: עמודה לא ממופה {k!r} בסקר {d['date']['end']} {d.get('firm')!r}")
                if "seats" in v:
                    values[cfg["cols"][k]] = {"s": v["seats"]}
                elif "pct" in v:
                    values[cfg["cols"][k]] = {"p": v["pct"], **({"pMax": v["pctMax"]} if "pctMax" in v else {})}
            firm_key, firm_he, pub_key, pub_he = hist_firm_pub(clean_firm(d.get("firm")), clean_publisher(d.get("publisher")),
                                                               cfg.get("combined", False))
            seat_sum = sum(e.get("s", 0) for e in values.values())
            base = f"k{n}-{d['date']['end']}-{slug(firm_key)}-{slug(pub_key)}"
            i = seen.get(base, 0)
            seen[base] = i + 1
            polls.append({
                "id": base if i == 0 else f"{base}-{chr(ord('a') + i)}",
                "start": d["date"]["start"], "end": d["date"]["end"],
                "firmKey": firm_key, "firmHe": firm_he, "publisherHe": pub_he,
                "values": values, "seatSum": seat_sum, "consistent": 118 <= seat_sum <= 122,
                "urls": d["urls"][:3],
            })
        polls.sort(key=lambda p: (p["end"], p["id"]), reverse=True)
        cycles.append({
            "id": f"k{n}", "knesset": n, "date": election["date"], "label": election["label"],
            "recommendedNetanyahu": RECOMMENDED_NETANYAHU[n],
            "polls": polls,
            "source": {"page": cfg["page"].replace("en__", "").replace(".wiki", "").replace("_", " "),
                       "sha256": sha256(path), "tableLine": text[:pos].count("\n") + 1},
        })
    return {"cycles": cycles}

# ---------------------------------------------------------------- המודל ותרחישי יום הבחירות

# המודל מתחיל ביום שאחרי הגשת רשימות המועמדים — מאז הרשימות בקלפי ידועות (שורת האירוע בדף הסקרים בוויקיפדיה)
LIST_SUBMISSION_2026 = "2026-09-08"
MODEL_SEED = 26


def load_lineage(results: list[dict]) -> dict:
    """raw/lineage.json — שיוך רשימות 2022 לרשימות 2026. נבדק כאן כדי ששגיאת שיוך תפיל את הבנייה."""
    lin = json.loads((RAW / "lineage.json").read_text(encoding="utf-8"))
    k25 = {l["short"] for l in results[-1]["lists"]}
    ids26 = {l["id"] for l in LISTS_2026}
    alts = {a["id"] for a in lin["alternatives"]}
    for a in alts:
        seen25, seen26 = set(), set()
        for f in lin["families"]:
            if a not in f["alts"]:
                continue
            assert set(f["k25"]) <= k25, f"lineage {f['id']}: unknown 2022 list {set(f['k25']) - k25}"
            assert set(f["k26"]) <= ids26, f"lineage {f['id']}: unknown 2026 list {set(f['k26']) - ids26}"
            assert not (seen25 & set(f["k25"])) and not (seen26 & set(f["k26"])), f"lineage {a}: list in two families"
            seen25 |= set(f["k25"])
            seen26 |= set(f["k26"])
    for f in lin["families"]:
        assert set(f["alts"]) <= alts, f"lineage {f['id']}: unknown alternative"
    return lin


def build_changes(lin: dict, results: list[dict], central: dict, groups_sc: dict) -> dict:
    """'מה השתנה מאז 2022': לכל חלופת שיוך — כל משפחה, אחוז מהקולות הכשרים ב-2022 מול הממוצע היום.
    שינוי נטו בין שתי תמונות בלבד; מה שלא שויך מוצג בנפרד, כך שכל עמודה מסתכמת ב-100%."""
    k25 = results[-1]
    valid = k25["valid"]
    by_short = {l["short"]: l for l in k25["lists"]}
    out = []
    for a in lin["alternatives"]:
        fams, used25, used26 = [], set(), set()
        for f in lin["families"]:
            if a["id"] not in f["alts"]:
                continue
            votes = sum(by_short[n]["votes"] for n in f["k25"])
            g = groups_sc["+".join(sorted(f["k26"]))]
            fams.append({
                "id": f["id"], "k25": f["k25"], "k26": f["k26"], "why": f["why"],
                "votes2022": votes, "share2022": round(100 * votes / valid, 2),
                "seats2022": sum(by_short[n]["seats"] for n in f["k25"]),
                "shareNow": round(sum(central["shares"][k] for k in f["k26"]), 2), "shareRange": g["share"],
                "seatsNow": sum(central["seats"][k] for k in f["k26"]), "seatsRange": g["seats"],
            })
            used25 |= set(f["k25"])
            used26 |= set(f["k26"])
        fams.sort(key=lambda x: -x["shareNow"])
        rest25 = [l for l in k25["lists"] if l["short"] not in used25]
        rest26 = [k for k in central["shares"] if k not in used26]
        out.append({
            **a, "families": fams,
            "unassigned2022": {"lists": [l["short"] for l in rest25 if l["votes"] >= 0.01 * valid],
                               "others": sum(1 for l in rest25 if l["votes"] < 0.01 * valid),
                               "share": round(100 * sum(l["votes"] for l in rest25) / valid, 2)},
            "unassignedNow": {"lists": rest26,
                              "share": round(100 - sum(central["shares"][k] for k in used26), 2)},
        })
    return {"election2022": k25["id"], "valid2022": valid, "alternatives": out}


def build_model(polls: list[dict], results: list[dict]) -> dict:
    """הממוצע מבוסס-המודל והתרחישים (pipeline/model.py). רק סקרים מאומתים, עקביים, שעברו 24 שעות מפרסומם."""
    import model as M

    use = [p for p in polls if p["consistent"] and p["eligibleToShow"] and p["verified"] and p["end"] > LIST_SUBMISSION_2026]
    inputs = [M.ModelInput(p["id"], f"{p['firm']}|{p['publisher'] or ''}", p["end"], p["values"],
                           (p.get("others") or {}).get("pct"), p.get("sample")) for p in use]
    lists = [l["id"] for l in LISTS_2026]
    pairs = [tuple(a["pair"]) for a in AGREEMENTS_2026]
    gov = [l["id"] for l in LISTS_2026 if l["gov37"]]
    start = (datetime.fromisoformat(LIST_SUBMISSION_2026) + timedelta(days=1)).date().isoformat()
    asof = max(p.end for p in inputs)
    obs_cfg, agg_cfg = M.ObsConfig(), M.AggConfig()
    fit = M.fit_average(inputs, lists, "likud", pairs, start, asof, obs_cfg, agg_cfg, MODEL_SEED)
    backtest = json.loads((OUT / "backtest.json").read_text(encoding="utf-8"))
    sc_cfg = M.ScenarioConfig(hist_sd_small=backtest["histSd"]["small"], hist_sd_large=backtest["histSd"]["large"])
    lin = load_lineage(results)
    groups = {"+".join(sorted(f["k26"])): f["k26"] for f in lin["families"]}
    sc = M.scenarios(fit, lists, "likud", pairs, "2026-10-27", agg_cfg, sc_cfg, MODEL_SEED, bloc=gov, groups=groups)
    reported_others = sorted(p.others_pct for p in inputs if p.others_pct is not None)
    others = reported_others[len(reported_others) // 2] / 100 if reported_others else 0.008
    trend = M.central_seats(fit, lists, "likud", pairs, others)
    day0 = datetime.fromisoformat(start)
    for point in trend:
        point["date"] = (day0 + timedelta(days=point.pop("day"))).date().isoformat()
    # "אילו הממוצע היה מעוגן במכון X": הממוצע + אפקט הבית של המכון ⇐ המנוע ⇐ מנדטים
    level, _ = M.level_at_end(fit)
    model_lists = ["likud"] + [k for k in lists if k in level]
    labels = {f"{p['firm']}|{p['publisher'] or ''}": (p["firmHe"], p["publisherHe"]) for p in use}
    counts = {}
    for o in fit["observed"]:
        counts[o.pollster] = counts.get(o.pollster, 0) + 1
    house = []
    for h in fit["pollsters"]:
        lr = {k: level[k] + fit["dims"][k].house.get(h, 0.0) for k in model_lists if k != "likud"}
        sh = M._shares_from_lr(model_lists, "likud", lr, others)
        idx = {k: i for i, k in enumerate(model_lists)}
        seats = M.fast_seats([int(round(sh[k] * M.VALID)) for k in model_lists], M.VALID,
                             [(idx[a], idx[b]) for a, b in pairs if a in idx and b in idx])
        house.append({"pollster": h, "firmHe": labels[h][0], "publisherHe": labels[h][1], "polls": counts.get(h, 0),
                      "seats": {k: seats[idx[k]] for k in model_lists}})
    return {
        "signature": backtest["modelSignature"], "electionDay": "2026-10-27", "start": start, "asof": asof,
        "polls": len(fit["observed"]), "skipped": fit["skipped"], "pollsters": len(fit["pollsters"]),
        "others": round(others * 100, 2), "central": trend[-1], "trend": trend, "scenarios": sc, "house": house,
        "changes": build_changes(lin, results, trend[-1], sc["groups"]),
        "params": {"draws": obs_cfg.draws, "kernel": obs_cfg.kernel, "walkSd": agg_cfg.walk_sd, "houseSd": agg_cfg.house_sd,
                   "nonsamplingSd": agg_cfg.nonsampling_sd, "histSdSmall": sc_cfg.hist_sd_small,
                   "histSdLarge": sc_cfg.hist_sd_large, "scenarios": sc_cfg.n},
    }

def build_forecast(polls: list[dict], build_time: datetime) -> dict:
    """מודל החיזוי (pipeline/forecast_live.py): אותם סקרים כמו הממוצע, סדרת מכון לפי HIST_FIRMS — כמו בבדיקת העבר."""
    import forecast_live as FL

    use = [p for p in polls if p["consistent"] and p["eligibleToShow"] and p["verified"] and p["end"] > LIST_SUBMISSION_2026]
    series_of = lambda firm: FL.K26["seriesMap"].get(firm) or "new_" + norm_name(firm).replace(" ", "_")
    out = FL.build(use, series_of, [tuple(a["pair"]) for a in AGREEMENTS_2026],
                   [l["id"] for l in LISTS_2026 if l["gov37"]], build_time.date())
    used = set(out["series"]) | set(out["seriesBefore"])
    out["seriesLabels"] = {series_of(p["firm"]): p["firmHe"] for p in use if series_of(p["firm"]) in used}
    return out


# ---------------------------------------------------------------- פנקס הבוחרים

def build_registry(results: list[dict]) -> dict:
    series = [{"id": r["id"], "label": r["label"], "date": r["date"], "eligible": r["eligible"],
               "voted": r["voted"], "valid": r["valid"], "invalid": r["invalid"]} for r in results]
    return {
        "series": series,
        "k26": {"eligible": 7_560_000, "status": "reported_estimate",
                "note": "דווח \"כ-7.56 מיליון\" (11% יותר מ-2022) בכתבה מ-28.9.2026; טרם אומת מול פרסום רשמי של ועדת הבחירות",
                "source": "https://israeled.org/38-party-lists-israels-2026-parliamentary-election/"},
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # BUILD_TIME מאפשר בנייה חוזרת זהה (בדיקת דטרמיניזם ב-CI) ובדיקות שעון מזויף להקפאה
    env_time = __import__("os").environ.get("BUILD_TIME")
    build_time = datetime.fromisoformat(env_time) if env_time else datetime.now(ISRAEL_TZ).replace(microsecond=0)
    results = build_results()
    polls = build_polls(build_time)
    registry = build_registry(results)
    apply_corrections(polls["polls"], build_time)
    apply_verification(polls["polls"])
    history = build_history(results)
    # SKIP_MODEL: בדיקות ההקפאה בונות את הנתונים שש פעמים — שם המודל אינו נבדק ואינו נכתב מחדש
    model_out = None if __import__("os").environ.get("SKIP_MODEL") else build_model(polls["polls"], results)
    forecast_out = None if __import__("os").environ.get("SKIP_MODEL") else build_forecast(polls["polls"], build_time)
    missing = sorted({n for p in polls["polls"] for n in (p["firmHe"], p["publisherHe"]) if untranslated(n)})
    if missing:
        print("⚠️ שמות בלי תרגום לעברית (להוסיף ל-FIRM_HE/PUB_HE):", ", ".join(missing))
    meta = {
        "dataAsOf": build_time.isoformat(),
        "electionDay": "2026-10-27",
        # 16ה(ח): מתום יום שישי שלפני הבחירות ועד סגירת הקלפיות. רגעים מוחלטים (25.10 — מעבר לשעון חורף).
        "freezeStart": FREEZE_START.isoformat(),
        "freezeEnd": FREEZE_END.isoformat(),
        "frozen": FROZEN_FROM <= build_time < FREEZE_END,
        "lists2026": LISTS_2026, "agreements2026": AGREEMENTS_2026, "historyNames": HISTORY_NAMES,
    }
    outputs = [("results", results), ("polls", polls), ("registry", registry), ("meta", meta), ("history", history)]
    if model_out is not None:
        outputs.append(("model", model_out))
    if forecast_out is not None:
        outputs.append(("forecast", forecast_out))
    for name, obj in outputs:
        indent = None if name in ("polls", "history") else 1  # קובצי הסקרים גדולים — נשמרים מכווצים
        (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=indent,
                                                     separators=(",", ":") if indent is None else None) + "\n",
                                          encoding="utf-8")
    n = len(polls["polls"])
    print(f"results: {len(results)} elections (all reproduced by the engine) · polls: {n} "
          f"(consistent: {sum(p['consistent'] for p in polls['polls'])}, "
          f"eligible to show: {sum(p['eligibleToShow'] for p in polls['polls'])}) · history: "
          + ", ".join(f"K{c['knesset']} {len(c['polls'])}" for c in history["cycles"]))


if __name__ == "__main__":
    main()
