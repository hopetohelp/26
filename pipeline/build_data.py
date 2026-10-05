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
    "Smith": "סמית'", "Statnet": "סטטנט",
}
PUB_HE = {
    "Kan 11": "כאן 11", "i24 News": "i24NEWS", "Channel 14": "ערוץ 14", "Zman Yisrael": "זמן ישראל",
    "Maariv": "מעריב", "Channel 13": "חדשות 13", "Channel 16": "ערוץ 16", "HaHadashot 12": "חדשות 12",
    "Channel 12": "חדשות 12", "Walla": "וואלה", "Israel Hayom": "ישראל היום", "Channel 11": "כאן 11",
    "103FM": "103FM", "Makor Rishon": "מקור ראשון",
}

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
    p = re.sub(r"<ref.*", "", p).strip(" '\"")
    return p or None


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
            columns, data = res[0]["columns"], res[1]
            # כתובות מקור לכל שורת סקר (לפי הסדר)
            raw_rows = wt.rows_of(table)
            url_rows = []
            for r in raw_rows:
                joined = "\n".join(c for _, c in r)
                if any(k == "h" for k, _ in r):
                    continue
                url_rows.append(re.findall(r"url\s*=\s*(https?://[^\s|}]+)", joined))
            ui = 0
            for d in data:
                urls = url_rows[ui] if ui < len(url_rows) else []
                ui += 1
                if d["type"] != "poll" or not d.get("date"):
                    continue
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
                firm = (d.get("firm") or "").strip()
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
    verified_path = ROOT / "raw" / "verification.json"
    if verified_path.exists():
        ver = json.loads(verified_path.read_text(encoding="utf-8"))
        by_id = {v["id"]: v for v in ver}
        for p in polls["polls"]:
            v = by_id.get(p["id"])
            if v:
                p["verified"] = v.get("status") == "match"
                p["verification"] = v
    meta = {
        "dataAsOf": build_time.isoformat(),
        "electionDay": "2026-10-27",
        # 16ה(ח): מתום יום שישי שלפני הבחירות ועד סגירת הקלפיות. רגעים מוחלטים (25.10 — מעבר לשעון חורף).
        "freezeStart": FREEZE_START.isoformat(),
        "freezeEnd": FREEZE_END.isoformat(),
        "frozen": FROZEN_FROM <= build_time < FREEZE_END,
        "lists2026": LISTS_2026, "agreements2026": AGREEMENTS_2026, "historyNames": HISTORY_NAMES,
    }
    for name, obj in [("results", results), ("polls", polls), ("registry", registry), ("meta", meta)]:
        indent = None if name == "polls" else 1  # קובץ הסקרים גדול — נשמר מכווץ
        (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=indent,
                                                     separators=(",", ":") if indent is None else None) + "\n",
                                          encoding="utf-8")
    n = len(polls["polls"])
    print(f"results: {len(results)} elections (all reproduced by the engine) · polls: {n} "
          f"(consistent: {sum(p['consistent'] for p in polls['polls'])}, "
          f"eligible to show: {sum(p['eligibleToShow'] for p in polls['polls'])})")


if __name__ == "__main__":
    main()
