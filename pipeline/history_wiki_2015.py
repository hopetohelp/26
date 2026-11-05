"""סקרי 2015 (הכנסת ה-20) מטבלת ויקיפדיה, לסקרים שאינם בתמלולי האימות (raw/forecast/verification/k19_k20_*).

הטבלה בדף "Opinion polling for the 2015 Israeli legislative election" בנויה אחרת מדפי 2019–2022: תאריך בלי שנה (השנה
בשורת כותרת "!colspan=20|2014"), ותאים מאוחדים (colspan) לרשימה משותפת. מיפוי זהות בלבד לאותיות הקלפי של 2015:
תא מאוחד העבודה+התנועה = המחנה הציוני (אמת); שלוש המפלגות הערביות יחד = הרשימה המשותפת (ודעם); עוצמה+העם איתנו = יחד (קץ).
מפלגה־קודמת (לפני איחוד) — בשם העמודה ב-unmapped, ומשויכת לגוש דרך raw/blocs.json (predecessors), כמו ב-2019–2022.
"""
from __future__ import annotations

import re
from datetime import date

COLS = ["Likud", "Yisrael Beiteinu", "Yesh Atid", "Israeli Labor Party", "Hatnuah", "The Jewish Home", "Shas",
        "United Torah Judaism", "Meretz", "Hadash", "UAL-Ta'al", "Balad", "Otzma Yehudit", "Yachad", "Kulanu"]
SINGLE = {"Likud": "מחל", "Yisrael Beiteinu": "ל", "Yesh Atid": "פה", "The Jewish Home": "טב", "Shas": "שס",
          "United Torah Judaism": "ג", "Meretz": "מרצ", "Kulanu": "כ"}
# תא מאוחד ⇐ שם (לפי העמודות שהוא מכסה)
MERGED = {("Israeli Labor Party", "Hatnuah"): "אמת", ("Hadash", "UAL-Ta'al", "Balad"): "ודעם",
          ("Otzma Yehudit", "Yachad"): "קץ", ("Likud", "Yisrael Beiteinu"): "Likud Beiteinu"}
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def _cell_value(text: str):
    t = re.sub(r"<!--.*?-->", "", text)
    t = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", t, flags=re.S).replace("'''", "").strip()
    if not t or "N/A" in t or t in ("–", "-", "—"):
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*%?", t)
    if not m:
        return None
    return float(m.group(1)) if "%" in t or "." in t else int(m.group(1))


def rows(text: str) -> list[dict]:
    """כל שורת סקר בטבלה הראשונה: {date, firm, values(אותיות), unmapped(שם), urls}. בלי שורות תוצאות ומדגמים."""
    start = text.index("{|class=\"wikitable")
    end = text.index("\n|}", start)
    body = text[start:end]
    year, out = None, []
    for block in body.split("\n|-"):
        h = re.search(r"!colspan=\d+\|\s*(\d{4})", block)
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
        joined = "\n".join(lines[1:])
        firm_part, _, rest = joined.partition("\n|") if not lines[1].count("</ref>") or True else ("", "", "")
        poll_cell = lines[1]
        i = 2
        while i < len(lines) and not re.match(r"\|\s*(?:colspan=\d+\|)?\s*('''|\d|\{\{N/A|<!--|$)", lines[i]) \
                and not re.match(r"\|\s*colspan", lines[i]):
            poll_cell += "\n" + lines[i]
            i += 1
        urls = re.findall(r"url=\s*(https?://[^\s|}]+)", poll_cell)
        firm = re.sub(r"<ref.*?</ref>|<ref[^>]*/>", "", poll_cell, flags=re.S)
        firm = re.sub(r"^\|\s*(style=\"[^\"]*\"\|)?", "", firm.split("\n")[0] if "<ref" not in firm.split("\n")[0] else firm)
        firm = re.sub(r"<ref.*", "", firm, flags=re.S).strip()
        if re.search(r"exit poll|result|outgoing", firm, re.I):
            continue
        values, unmapped, col = {}, {}, 0
        for l in lines[i:]:
            if not l.startswith("|"):
                continue
            m = re.match(r"\|\s*colspan=\s*\"?(\d+)\"?\s*\|(.*)", l)
            span, cell = (int(m.group(1)), m.group(2)) if m else (1, l[1:])
            names = tuple(COLS[col:col + span])
            col += span
            v = _cell_value(cell)
            if v is None:
                continue
            entry = {"p": v} if isinstance(v, float) else {"s": v}
            if span == 1 and names[0] in SINGLE:
                values[SINGLE[names[0]]] = entry
            elif names in MERGED and len(MERGED[names]) <= 4 and not MERGED[names][0].isascii():
                values[MERGED[names]] = entry
            else:
                unmapped["+".join(names) if names not in MERGED else MERGED[names]] = entry
        if col < 10:
            continue
        out.append({"date": date(year, MONTHS[d.group(2)], int(d.group(1))).isoformat(), "firm": firm,
                    "values": values, "unmapped": unmapped, "urls": urls[:3]})
    return out


FIRMS = [(r"panel", "panels_politics"), (r"teleseker|tns|kantar", "kantar"), (r"smith", "smith"),
         (r"midgam", "midgam"), (r"dialog", "dialog"), (r"geocartography", "geocartography"),
         (r"maagar mochot", "maagar_mochot"), (r"\btri\b", "tri"), (r"202 strategies", "202_strategies")]


def add_polls(cycle: dict, election: dict, firm_names: dict, publisher_he, slug) -> list[str]:
    """מוסיף לסבב 2015 את שורות הוויקיפדיה שאינן כבר בסבב (אותו יום ±1 ואותם מספרים לליכוד/יש עתיד ⇐ אותו סקר).
    שורה שסכום המנדטים בה אינו 118–122 (קריאה חלקית) — מושמטת ומדווחת."""
    from pathlib import Path
    from datetime import date as D
    text = (Path(__file__).resolve().parent.parent / "raw" / "wikipedia" /
            "en__Opinion_polling_for_the_2015_Israeli_legislative_election.wiki").read_text(encoding="utf-8")
    have = [(D.fromisoformat(p.get("published") or p["end"]), p["values"], p["firmKey"]) for p in cycle["polls"]]
    seen, skipped = {p["id"] for p in cycle["polls"]}, []
    for r in rows(text):
        d = D.fromisoformat(r["date"])
        if r["date"] >= election["date"]:
            continue
        key = lambda v: tuple(v.get(k, {}).get("s") for k in ("פה", "טב", "ג", "מרצ"))  # noqa: E731
        firm_txt = re.sub(r"''|&nbsp;", " ", r["firm"]).strip()
        firm_key = next((k for pat, k in FIRMS if re.search(pat, firm_txt, re.I)), "unknown")
        big = lambda v: tuple(v.get(k, {}).get("s") for k in ("מחל", "פה", "אמת"))  # noqa: E731
        # אותו סקר: אותו יום ±1 ואותם מספרים, או אותו מכון ±2 ימים ואותם מספרים לשלוש הגדולות (סקר שתוקן בתמלול)
        if any((abs((d - hd).days) <= 1 and key(hv) == key(r["values"])) or
               (abs((d - hd).days) <= 2 and hf == firm_key and big(hv) == big(r["values"]) and big(hv)[0] is not None)
               for hd, hv, hf in have):
            continue
        total = sum(e.get("s", 0) for e in [*r["values"].values(), *r["unmapped"].values()])
        if not 118 <= total <= 122:
            skipped.append(f"{r['date']} {firm_txt} ({total})")
            continue
        pub = publisher_he(20, firm_txt)
        pub_en = firm_txt.split("/", 1)[1] if "/" in firm_txt else (firm_txt if firm_key == "unknown" else "")
        base = f"k20-{r['date']}-{slug(firm_key)}-{slug(pub_en) or 'x'}"
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
