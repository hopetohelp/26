"""תוצאות האמת לפי קלפי — קובצי ועדת הבחירות המרכזית לכל מערכת (raw/cec/README.md).

מקור אחד לשלושה תוצרים:
  * בדיקה: סכום הקלפיות = התוצאה הארצית (קולות לכל רשימה, כשרים, פסולים, מצביעים); המעטפות החיצוניות/הכפולות — שורות נפרדות.
  * יישובים 2026: מסכמים את קובץ הקלפיות לפי סמל ישוב (localities.json, אותו מבנה של 2015–2022).
  * ועדות: סיכום לפי סמל ועדה בכל מערכת שבה הקובץ הרשמי כולל את השדה (src/data/committees.json).
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
FILES = {n: RAW / "cec" / f"k{n}_expb.csv" for n in range(19, 25)} | {25: RAW / "ballots-2022.csv", 26: RAW / "ballots-2026.csv"}
SOURCES = {
    19: "https://data.gov.il/dataset/votes-knesset (משאב 432d3185-545a-41d9-8c72-d10ee515919c)",
    20: "https://data.gov.il/dataset/votes-knesset (משאב c3db5581-f48d-45fc-b221-e7635e940c41)",
    **{n: f"https://media{n}.bechirot.gov.il/files/expb.csv" for n in (21, 22, 23, 24)},
    25: "https://data.gov.il/dataset/votes-knesset (משאב cc223336-07bc-485d-b160-62df92967c0a)",
    26: "ועדת הבחירות המרכזית — קובץ התוצאות הרשמי לפי קלפי (raw/ballots-2026.csv)",
}
META = {"סמל ועדה", "ברזל", "שם ישוב", "סמל ישוב", "קלפי", "מספר קלפי", "ריכוז", "שופט", "בזב", "מצביעים", "פסולים", "כשרים",
        "חיצוניות", "קלפי אחרת", ""}
EXTERNAL = "מעטפות חיצוניות"
# אותיות 2026 ⇐ מזהה ב-src/data/meta.json lists2026 (לפי מזהי JDN ב-fetch_results_2026.py). מקור אחד: גם מעבר המצביעים
# (pipeline/voter_flow.py, NEW) קורא מכאן. כאן ולא שם — כי הבנייה (build_data.py) רצה בלי numpy
LETTERS_2026 = {"מחל": "likud", "דרך": "yashar", "ודם": "joint", "רק": "together", "אמת": "democrats", "ג": "utj", "ל": "yb",
                "ב": "otzma", "שס": "shas", "ט": "rzp", "עם": "raam", "די": "reservists", "ך": "amcha",
                "נר": "code_black", "זך": "haredi_public", "ני": "noam"}


def _text(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1255")


def _int(v) -> int:
    return int(float(v or 0))


def read(n: int) -> list[dict]:
    """כל קלפי בקובץ הרשמי, בשדות אחידים; external = שורת המעטפות החיצוניות/הכפולות (לא משויכת ליישוב)."""
    out = []
    for r in csv.DictReader(_text(FILES[n]).splitlines()):
        code = r["סמל ישוב"].strip()
        external = code in ("0", "9999") or "מעטפות" in r["שם ישוב"]
        out.append({"committee": r["סמל ועדה"].strip() if "סמל ועדה" in r else None,
                    "code": code, "name": EXTERNAL if external else r["שם ישוב"].strip(), "external": external,
                    "ballot": (r.get("קלפי") or r.get("מספר קלפי") or "").strip(),
                    "eligible": _int(r["בזב"]), "voted": _int(r["מצביעים"]), "valid": _int(r["כשרים"]), "invalid": _int(r["פסולים"]),
                    "votes": {k: _int(v) for k, v in r.items() if k not in META and k is not None}})
    return out


def check_rows(n: int, rows: list[dict]) -> None:
    for r in rows:
        assert sum(r["votes"].values()) == r["valid"], (n, r["code"], r["ballot"], "valid")
        assert r["voted"] == r["valid"] + r["invalid"], (n, r["code"], r["ballot"], "voted")
    assert any(r["external"] for r in rows), (n, "no external envelopes row")


def check_national(n: int, rows: list[dict], national: dict) -> None:
    """national: שורת results.json (מצביעים, כשרים, פסולים, קולות לכל רשימה לפי אותיות)."""
    check_rows(n, rows)
    for k in ("voted", "valid", "invalid"):
        assert sum(r[k] for r in rows) == national[k], (n, k)
    for l in national["lists"]:
        assert sum(r["votes"].get(l["letters"], 0) for r in rows) == l["votes"], (n, l["letters"])


def check_2026(rows: list[dict]) -> dict:
    """2026: התוצאה הארצית ב-raw/results-2026.json (קולות לפי מזהה רשימה וכשרים)."""
    nat = json.loads((RAW / "results-2026.json").read_text(encoding="utf-8"))
    check_rows(26, rows)
    assert sum(r["valid"] for r in rows) == nat["valid"], (26, "valid")
    for letters, lid in LETTERS_2026.items():
        assert sum(r["votes"].get(letters, 0) for r in rows) == nat["votes"].get(lid, 0), (26, letters)
    return nat


def summarize(rows: list[dict], key: str) -> list[dict]:
    """סיכום לפי שדה (code = יישוב, committee = ועדה); המעטפות החיצוניות — שורה נפרדת, לא משויכות."""
    groups: dict[str, dict] = {}
    for r in rows:
        k = "external" if r["external"] else r[key]
        g = groups.setdefault(k, {"code": r["code"] if key == "code" else k, "name": r["name"] if key == "code" or r["external"] else None,
                                  "external": r["external"], "ballots": 0, "eligible": 0, "voted": 0, "valid": 0, "invalid": 0,
                                  "votes": {}, "localities": {}})
        g["ballots"] += 1
        for f in ("eligible", "voted", "valid", "invalid"):
            g[f] += r[f]
        for l, v in r["votes"].items():
            g["votes"][l] = g["votes"].get(l, 0) + v
        if not r["external"]:
            g["localities"][r["name"]] = g["localities"].get(r["name"], 0) + r["voted"]
    return list(groups.values())


def localities_2026(sha256, lists2026: list[dict], eligible_national: int) -> dict:
    """"תוצאות לפי יישוב" של 2026 מקובץ הקלפיות — אותו מבנה של 2015–2022 (historical_data.build_localities)."""
    rows = read(26)
    nat = check_2026(rows)
    loc = summarize(rows, "code")
    names = {l["id"]: l["name"] for l in lists2026}
    letters = sorted({l for r in rows for l, v in r["votes"].items() if v}, key=lambda l: -sum(r["votes"].get(l, 0) for r in rows))
    out_rows = [{"code": g["code"], "name": g["name"], "external": g["external"], "eligible": g["eligible"], "voted": g["voted"],
                 "valid": g["valid"], "invalid": g["invalid"], "votes": {l: g["votes"].get(l, 0) for l in letters}} for g in loc]
    assert len({r["code"] for r in out_rows}) == len(out_rows)
    return {"id": "k26", "label": "אוקטובר 2026", "date": "2026-10-27", "source": SOURCES[26], "sha256": sha256(FILES[26]),
            # רשימה בלי שם רשמי בקובץ (הרשימות הקטנות) — לפי האותיות שבפתק, כמו ב-2015
            "lists": [{"letters": l, "name": names.get(LETTERS_2026.get(l), l)} for l in letters],
            "eligibleInLocalityFile": sum(r["eligible"] for r in out_rows), "eligibleNational": eligible_national, "asOf": nat.get("asOf"),
            "rows": sorted(out_rows, key=lambda r: (r["external"], r["name"]))}


def committees(results: list[dict], sha256) -> dict:
    """סיכום לפי ועדה (סמל ועדה) בכל מערכת שבה הקובץ הרשמי כולל את השדה; אחרת — רשום שאין מקור רשמי."""
    national = {e["knesset"]: e for e in results}
    elections = []
    for n in sorted(FILES):
        if not FILES[n].exists():
            continue
        rows = read(n)
        if n == 26:
            check_2026(rows)
        elif n in national:
            check_national(n, rows, national[n])
        else:
            check_rows(n, rows)
        entry = {"knesset": n, "id": f"k{n}", "source": SOURCES[n], "sha256": sha256(FILES[n]), "ballots": len(rows),
                 "externalBallots": sum(r["external"] for r in rows)}
        if rows[0]["committee"] is None:
            entry["committees"] = None
            entry["note"] = "אין מקור רשמי: בקובץ הקלפיות הרשמי של מערכת זו אין שדה סמל ועדה, ואין קובץ רשמי אחר שממפה קלפי לוועדה"
        else:
            entry["committees"] = sorted(({"code": g["code"], "external": g["external"], "ballots": g["ballots"],
                                           # לזיהוי הוועדה: שלושת היישובים עם הכי הרבה מצביעים (לוועדה אין שם בקובץ)
                                           "localities": len(g["localities"]), "largest": sorted(g["localities"], key=lambda x: -g["localities"][x])[:3],
                                           "eligible": g["eligible"], "voted": g["voted"], "valid": g["valid"], "invalid": g["invalid"],
                                           "votes": {l: v for l, v in sorted(g["votes"].items()) if v}}
                                          for g in summarize(rows, "committee")), key=lambda g: (g["external"], int(g["code"]) if g["code"].isdigit() else 999))
        elections.append(entry)
    # בלי about: הנתונים הפתוחים עוטפים את הקובץ (src/lib/openData.ts); התיאור שם
    return {"elections": elections}
