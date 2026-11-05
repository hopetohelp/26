"""סקרי 2015 ו-2013 (הכנסות ה-20 וה-19) מטבלת ויקיפדיה, לסקרים שאינם בתמלולי האימות (raw/forecast/verification/k19_k20_*).

הטבלאות בדפים "Opinion polling for the 2015/2013 Israeli legislative election" בנויות אחרת מדפי 2019–2022: תאריך בלי שנה
(השנה בשורת כותרת, למשל "!colspan=20|2014" או "|colspan=21| '''2012'''"), ותאים מאוחדים (colspan) לרשימה משותפת.
מיפוי זהות בלבד לאותיות הקלפי של אותה מערכת; תא מאוחד שמכסה בדיוק רשימה משותפת שבקלפי ⇐ אותיותיה.
מפלגה־קודמת (לפני איחוד) — בשם העמודה ב-unmapped, ומשויכת לגוש דרך raw/blocs.json (predecessors), כמו ב-2019–2022.
"""
from __future__ import annotations

import re
from datetime import date

CONFIG = {
    # 2015: העבודה+התנועה = המחנה הציוני (אמת); שלוש המפלגות הערביות = הרשימה המשותפת (ודעם); עוצמה+העם איתנו = יחד (קץ)
    20: {"page": "en__Opinion_polling_for_the_2015_Israeli_legislative_election.wiki",
         "cols": ["Likud", "Yisrael Beiteinu", "Yesh Atid", "Israeli Labor Party", "Hatnuah", "The Jewish Home", "Shas",
                  "United Torah Judaism", "Meretz", "Hadash", "UAL-Ta'al", "Balad", "Otzma Yehudit", "Yachad", "Kulanu"],
         "single": {"Likud": "מחל", "Yisrael Beiteinu": "ל", "Yesh Atid": "פה", "The Jewish Home": "טב", "Shas": "שס",
                    "United Torah Judaism": "ג", "Meretz": "מרצ", "Kulanu": "כ"},
         "merged": {("Israeli Labor Party", "Hatnuah"): "אמת", ("Hadash", "UAL-Ta'al", "Balad"): "ודעם",
                    ("Otzma Yehudit", "Yachad"): "קץ", ("Likud", "Yisrael Beiteinu"): "Likud Beiteinu"},
         "key": ("פה", "טב", "ג", "מרצ"), "big": ("מחל", "פה", "אמת")},
    # 2013: הליכוד+ישראל ביתנו = הליכוד ביתנו (מחל); האיחוד הלאומי+הבית היהודי = הבית היהודי (טב)
    19: {"page": "en__Opinion_polling_for_the_2013_Israeli_legislative_election.wiki",
         "cols": ["Kadima", "Likud", "Yisrael Beiteinu", "Israeli Labor Party", "Shas", "United Torah Judaism", "National Union",
                  "The Jewish Home", "UAL-Ta'al", "Hadash", "Balad", "Meretz", "Yesh Atid", "Otzma LeYisrael", "Am Shalem", "Hatnuah"],
         "single": {"Kadima": "כן", "Israeli Labor Party": "אמת", "Shas": "שס", "United Torah Judaism": "ג", "UAL-Ta'al": "עם",
                    "Hadash": "ו", "Balad": "ד", "Meretz": "מרץ", "Yesh Atid": "פה", "Otzma LeYisrael": "נץ", "Am Shalem": "ץ",
                    "Hatnuah": "צפ"},
         "merged": {("Likud", "Yisrael Beiteinu"): "מחל", ("National Union", "The Jewish Home"): "טב"},
         "key": ("אמת", "שס", "ג", "מרץ"), "big": ("מחל", "אמת", "שס")},
}
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
YEAR_ROW = re.compile(r"(?m)^[!|]\s*colspan=\d+\|\s*(?:'{3})?\s*(\d{4})\s*(?:'{3})?\s*$")


def _cell_value(text: str):
    t = re.sub(r"<!--.*?-->", "", text)
    t = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", t, flags=re.S).replace("'''", "")
    t = re.sub(r'^\s*style="[^"]*"\s*\|', "", t).strip()
    if not t or "N/A" in t or t in ("–", "-", "—"):
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*%?", t)
    if not m:
        return None
    return float(m.group(1)) if "%" in t or "." in t else int(m.group(1))


def rows(text: str, n: int = 20) -> list[dict]:
    """כל שורת סקר בטבלה הראשונה: {date, firm, values(אותיות), unmapped(שם), urls}. בלי שורות תוצאות ומדגמים."""
    cfg = CONFIG[n]
    start = text.index("{|class=")
    end = text.index("\n|}", start)
    body = text[start:end]
    year, out = None, []
    for block in body.split("\n|-"):
        h = YEAR_ROW.search(block)
        if h:
            year = int(h.group(1))
            continue
        lines = [l for l in block.split("\n") if l.strip()]
        if len(lines) < 3 or not lines[0].startswith("|") or year is None:
            continue
        d = re.fullmatch(r"\|\s*(?:\d{1,2}\s*[–-]\s*)?(\d{1,2})\s+([A-Z][a-z]{2})\s*", lines[0])
        if not d or d.group(2) not in MONTHS:
            continue
        # תא הסקר יכול להתפרס על כמה שורות (הפניות); הערכים — השורות שמתחילות ב-| אחריו
        poll_cell = lines[1]
        i = 2
        while i < len(lines) and not re.match(r"\|\s*(?:colspan=\d+\|)?\s*('''|\d|\{\{N/A|<!--|$|style=)", lines[i]) \
                and not re.match(r"\|\s*colspan", lines[i]):
            poll_cell += "\n" + lines[i]
            i += 1
        urls = re.findall(r"url=\s*(https?://[^\s|}]+)", poll_cell) or re.findall(r"\[(https?://[^\s\]]+)", poll_cell)
        firm = re.sub(r"<ref.*?</ref>|<ref[^>]*/>", "", poll_cell, flags=re.S)
        firm = re.sub(r"^\|\s*(style=\"[^\"]*\"\|)?", "", firm.split("\n")[0] if "<ref" not in firm.split("\n")[0] else firm)
        firm = re.sub(r"<ref.*|<!--.*", "", firm, flags=re.S).strip()
        if re.search(r"exit poll|result|outgoing", firm, re.I):
            continue
        values, unmapped, col = {}, {}, 0
        for l in lines[i:]:
            if not l.startswith("|"):
                continue
            m = re.match(r"\|\s*(?:style=\"[^\"]*\"\s*)?colspan=\s*\"?(\d+)\"?\s*\|(.*)", l)
            span, cell = (int(m.group(1)), m.group(2)) if m else (1, l[1:])
            names = tuple(cfg["cols"][col:col + span])
            col += span
            v = _cell_value(cell)
            if v is None or not names:
                continue
            entry = {"p": v} if isinstance(v, float) else {"s": v}
            if span == 1 and names[0] in cfg["single"]:
                values[cfg["single"][names[0]]] = entry
            elif names in cfg["merged"] and not cfg["merged"][names].isascii():
                values[cfg["merged"][names]] = entry
            else:
                unmapped["+".join(names) if names not in cfg["merged"] else cfg["merged"][names]] = entry
        if col < len(cfg["cols"]) - 5:
            continue
        out.append({"date": date(year, MONTHS[d.group(2)], int(d.group(1))).isoformat(), "firm": firm,
                    "values": values, "unmapped": unmapped, "urls": urls[:3]})
    return out


FIRMS = [(r"panel", "panels_politics"), (r"teleseker|tns|kantar", "kantar"), (r"smith", "smith"),
         (r"midgam", "midgam"), (r"dialog", "dialog"), (r"geocartography", "geocartography"),
         (r"maagar mochot", "maagar_mochot"), (r"\btri\b", "tri"), (r"202 strategies", "202_strategies"),
         (r"dahaf", "dahaf"), (r"new wave", "new_wave")]


def add_polls(cycle: dict, election: dict, firm_names: dict, publisher_he, slug, prev_date: str) -> list[str]:
    """מוסיף לסבב את שורות הוויקיפדיה שאינן כבר בסבב (אותו יום ±1 ואותם מספרים, או אותו מכון ±2 ימים ואותם מספרים
    לגדולות ⇐ אותו סקר, גם כשתוקן בתמלול). רק מהיום שאחרי הבחירות הקודמות. שורה שסכום המנדטים בה אינו 118–122
    (קריאה חלקית) — מושמטת ומדווחת."""
    from pathlib import Path
    from datetime import date as D
    n = cycle["knesset"]
    cfg = CONFIG[n]
    text = (Path(__file__).resolve().parent.parent / "raw" / "wikipedia" / cfg["page"]).read_text(encoding="utf-8")
    have = [(D.fromisoformat(p.get("published") or p["end"]), p["values"], p["firmKey"]) for p in cycle["polls"]]
    seen, skipped = {p["id"] for p in cycle["polls"]}, []
    key = lambda v: tuple(v.get(k, {}).get("s") for k in cfg["key"])  # noqa: E731
    big = lambda v: tuple(v.get(k, {}).get("s") for k in cfg["big"])  # noqa: E731
    for r in rows(text, n):
        d = D.fromisoformat(r["date"])
        if r["date"] >= election["date"] or r["date"] <= prev_date:
            continue
        firm_txt = re.sub(r"''|&nbsp;", " ", r["firm"]).strip()
        firm_key = next((k for pat, k in FIRMS if re.search(pat, firm_txt, re.I)), "unknown")
        if any((abs((d - hd).days) <= 1 and key(hv) == key(r["values"])) or
               (abs((d - hd).days) <= 2 and hf == firm_key and big(hv) == big(r["values"]) and big(hv)[0] is not None)
               for hd, hv, hf in have):
            continue
        total = sum(e.get("s", 0) for e in [*r["values"].values(), *r["unmapped"].values()])
        if not 118 <= total <= 122:
            skipped.append(f"{r['date']} {firm_txt} ({total})")
            continue
        pub = publisher_he(n, firm_txt)
        pub_en = firm_txt.split("/", 1)[1] if "/" in firm_txt else (firm_txt if firm_key == "unknown" else "")
        base = f"k{n}-{r['date']}-{slug(firm_key)}-{slug(pub_en) or 'x'}"
        pid, i = base, 1
        while pid in seen:
            pid, i = f"{base}-{chr(ord('a') + i)}", i + 1
        seen.add(pid)
        cycle["polls"].append({
            "id": pid, "start": r["date"], "end": r["date"], "dateBasis": "publication", "published": r["date"],
            "firmKey": firm_key, "firmHe": firm_names.get(firm_key, "מכון לא צוין"), "publisherHe": pub,
            "values": r["values"], **({"unmapped": r["unmapped"]} if r["unmapped"] else {}),
            "seatSum": total, "consistent": True, "preLists": True, "urls": r["urls"]})
    cycle["polls"].sort(key=lambda p: (p["end"], p["id"]), reverse=True)
    return skipped
