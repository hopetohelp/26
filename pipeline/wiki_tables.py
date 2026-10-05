"""ממיר טבלאות סקרים מוויקיפדיה (wikitext) לרשומות מובנות.
מטפל ב-colspan/rowspan, בתאריכי Opdrts, באחוזים מתחת לסף ({{small|(1.3%)}}) ובשורות-אירוע.
"""
import re, json, sys

MONTHS = {m: i for i, m in enumerate(
    ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], 1)}

def split_top(s, sep):
    """מפצל את s לפי sep רק ברמה העליונה (לא בתוך {{ }} או [[ ]])."""
    out, depth_t, depth_l, cur, i = [], 0, 0, [], 0
    while i < len(s):
        if s.startswith("{{", i): depth_t += 1; cur.append("{{"); i += 2; continue
        if s.startswith("}}", i) and depth_t: depth_t -= 1; cur.append("}}"); i += 2; continue
        if s.startswith("[[", i): depth_l += 1; cur.append("[["); i += 2; continue
        if s.startswith("]]", i) and depth_l: depth_l -= 1; cur.append("]]"); i += 2; continue
        if depth_t == 0 and depth_l == 0 and s.startswith(sep, i):
            out.append("".join(cur)); cur = []; i += len(sep); continue
        cur.append(s[i]); i += 1
    out.append("".join(cur))
    return out

def strip_refs(s):
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    # efn ו-refn עם קינון
    while True:
        m = re.search(r"\{\{\s*(efn|refn|Efn|cn|citation needed)\b", s)
        if not m: break
        i, depth = m.start(), 0
        j = i
        while j < len(s):
            if s.startswith("{{", j): depth += 1; j += 2; continue
            if s.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        s = s[:i] + s[j:]
    return s

def cell_parts(raw):
    """מפריד בין מאפייני התא (style/colspan/rowspan) לתוכן."""
    parts = split_top(raw, "|")
    if len(parts) >= 2 and re.match(r"^\s*((style|colspan|rowspan|class|data-sort-value|align|width)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s|]+)\s*)+$", parts[0]):
        attrs, content = parts[0], "|".join(parts[1:])
    else:
        attrs, content = "", raw
    # תא פגום נפוץ בוויקיפדיה: מאפיין בלי "|" לפני התוכן, למשל colspan=2{{N/A}} — מפרידים ידנית
    if not attrs:
        m = re.match(r'^\s*((?:colspan|rowspan)\s*=\s*"?\d+"?)\s*(\{\{.*|\d.*)$', content, re.S)
        if m:
            attrs, content = m.group(1), m.group(2).strip()
    cs = re.search(r'colspan\s*=\s*"?(\d+)', attrs)
    rs = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
    return attrs, content.strip(), int(cs.group(1)) if cs else 1, int(rs.group(1)) if rs else 1

def link_text(s):
    s = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", s)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"\{\{\s*small\s*\|(.*?)\}\}", r"\1", s)
    s = re.sub(r"'''?", "", s)
    return re.sub(r"\s+", " ", s).strip()

def parse_plain_date(content):
    c = re.sub(r"<!--.*?-->", "", strip_refs(content))
    c = link_text(c).replace("\u2013", "-").replace("\u2014", "-")
    c = re.sub(r"\{\{[^}]*\}\}", "", c).strip()
    # e.g. "15 Sep 22", "1-3 Nov 2022", "28 Oct-1 Nov 22", "31 Mar 2015"
    m = re.match(r"^(\d{1,2})(?:\s*([A-Za-z]{3,9}))?\s*(?:-\s*(\d{1,2})\s*)?([A-Za-z]{3,9})?\s*(\d{2,4})$", c)
    if not m: return None
    d1, mon1, d2, mon2, yr = m.groups()
    yr = int(yr); yr = yr + 2000 if yr < 100 else yr
    if d2 is None:
        mon = MONTHS.get((mon1 or mon2 or "")[:3].lower())
        if not mon: return None
        s = f"{yr:04d}-{mon:02d}-{int(d1):02d}"; return {"start": s, "end": s}
    mon_e = MONTHS.get((mon2 or mon1 or "")[:3].lower())
    mon_s = MONTHS.get((mon1 or mon2 or "")[:3].lower())
    if not mon_e or not mon_s: return None
    ys = yr if mon_s <= mon_e else yr - 1
    return {"start": f"{ys:04d}-{mon_s:02d}-{int(d1):02d}", "end": f"{yr:04d}-{mon_e:02d}-{int(d2):02d}"}

def parse_date(content, attrs=""):
    m = re.search(r"\{\{\s*Opdrts\s*\|([^}]*)\}\}", content, re.I)
    if not m:
        d = parse_plain_date(content)
        if d is None:
            # תאריך גלוי בלי שנה ("17 Sep") — השנה בלבד נלקחת מ-data-sort-value. היום והחודש תמיד מהטקסט הגלוי:
            # בוויקיפדיה יש ערכי מיון שגויים (למשל מדגם 17.9.2019 עם ערך מיון 2019-08-17)
            y = re.search(r'data-sort-value\s*=\s*"?(\d{4})-\d{2}-\d{2}', attrs)
            if y:
                d = parse_plain_date(content + " " + y.group(1))
        return d
    p = [x.strip() for x in m.group(1).split("|")]
    while len(p) < 4: p.append("")
    d1, d2, mon, yr = p[0], p[1], p[2], p[3]
    # תבנית Opdrts: |יום-התחלה|יום-סיום|חודש|שנה  (יום-התחלה ריק = יום אחד). חודש התחלה שונה: פרמטר 5 אופציונלי
    mon_i = MONTHS.get(mon[:3].lower())
    try:
        y = int(yr); e = int(d2) if d2 else None
    except ValueError:
        return None
    if not mon_i or e is None: return None
    s = int(d1) if d1 else e
    smon, syr = mon_i, y
    if s > e:  # חוצה חודש, למשל 30|1|Oct = 30 בספטמבר עד 1 באוקטובר
        smon = mon_i - 1 or 12
        syr = y if mon_i > 1 else y - 1
    return {"start": f"{syr:04d}-{smon:02d}-{s:02d}", "end": f"{y:04d}-{mon_i:02d}-{e:02d}"}

def parse_value(content):
    c = re.sub(r"<!--.*?-->", "", strip_refs(content), flags=re.S).strip().lstrip("|").strip()
    m = re.match(r"\{\{\s*Hidden\s*\|([^|}]*)", c)
    if m: c = m.group(1).strip()
    c = re.sub(r"'''?", "", c).strip()
    if not c or re.fullmatch(r"\{\{\s*(n/a|N/A|na|NA|—|-)\s*\}\}|[–—-]|N/A|n/a", c):
        return None
    c = re.sub(r"<small>(.*?)</small>", r"{{small|\1}}", c)
    # מנדטים ולצדם אחוז ("4<br/>{{small|(3.9%)}}") — הסקר פרסם את שניהם
    m = re.fullmatch(r"(\d+)\s*<br\s*/?>\s*\{\{\s*small\s*\|\s*\(?\s*([\d.]+)\s*%\s*\)?\s*\}\}", c)
    if m: return {"seats": int(m.group(1)), "pct": float(m.group(2))}
    # טווח אחוזים מתחת לסף ("(1.7-2.1%)") — נשמר הגבול התחתון והעליון
    m = re.fullmatch(r"\{\{\s*small\s*\|\s*\(?\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*%\s*\)?\s*\}\}", c)
    if m: return {"pct": float(m.group(1)), "pctMax": float(m.group(2))}
    m = re.fullmatch(r"\{\{\s*small\s*\|\s*\(?\s*([\d.]+)\s*%\s*\)?\s*\}\}", c)
    if m: return {"pct": float(m.group(1))}
    m = re.fullmatch(r"\(?\s*([\d.]+)\s*%\s*\)?", c)
    if m: return {"pct": float(m.group(1))}
    m = re.fullmatch(r"\d+", c)
    if m: return {"seats": int(c)}
    return {"raw": c[:80]}

def tables(wikitext):
    out, i = [], 0
    while True:
        a = wikitext.find("\n{|", i)
        if a < 0: break
        depth, j = 0, a + 1
        while j < len(wikitext):
            if wikitext.startswith("\n{|", j - 1) or (j == a + 1): 
                pass
            if wikitext.startswith("{|", j): depth += 1; j += 2; continue
            if wikitext.startswith("|}", j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        out.append((a, wikitext[a + 1:j]))
        i = j
    return out

def rows_of(table):
    """מחזיר רשימת שורות; כל שורה = רשימת (סוג, תא גולמי)."""
    rows, cur = [], []
    for line in table.split("\n")[1:]:
        st = line.strip()
        if st.startswith("|}"): break
        if st.startswith("|-"):
            if cur: rows.append(cur)
            cur = []; continue
        if st.startswith("|+"): continue
        if st.startswith("!"):
            for c in split_top(st[1:], "!!"): cur.append(("h", c))
        elif st.startswith("|"):
            for c in split_top(st[1:], "||"): cur.append(("d", c))
        elif cur:  # המשך תא בשורה הבאה
            k, c = cur[-1]; cur[-1] = (k, c + "\n" + line)
    if cur: rows.append(cur)
    return rows

def header_columns(rows):
    """בונה רשת כותרות (rowspan/colspan) ומחזיר שם לכל עמודה סופית:
    התווית העמוקה ביותר שאינה ריקה; אם אין — שם המפלגה מתבנית party color; אחרת התווית העליונה."""
    h = []
    for r in rows:
        if r and all(k == "h" for k, _ in r): h.append(r)
        else: break
    if not h: return None, 0
    grid, pending = [], {}
    for r in h:
        line, idx, cells = {}, 0, [cell_parts(c) for _, c in r]
        def skip():
            nonlocal idx
            while idx in pending:
                rem, info = pending[idx]
                for t in range(info["cs"]): line[idx + t] = info
                if rem <= 1: del pending[idx]
                else: pending[idx] = (rem - 1, info)
                idx += info["cs"]
        for attrs, content, cs, rs in cells:
            skip()
            m = re.search(r"party color\|([^}|]+)", attrs + content)
            info = {"label": link_text(strip_refs(content)), "party": m.group(1).strip() if m else None,
                    "cs": cs, "id": id(attrs) ^ hash(content) ^ len(grid) * 7919 ^ idx}
            for t in range(cs): line[idx + t] = info
            if rs > 1: pending[idx] = (rs - 1, info)
            idx += cs
        skip()
        grid.append(line)
    ncols = max(max(l.keys()) + 1 for l in grid if l)
    cols = []
    for c in range(ncols):
        top = grid[0].get(c)
        top_label = top["label"] if top else ""
        if re.match(r"^(gov|opp|others?|coalition|opposition|lead)\b|^[lr]$", top_label.strip(" '\"").lower()):
            cols.append({"key": top_label, "label": top_label, "group": None}); continue
        name, party = None, None
        for r in range(len(grid) - 1, -1, -1):
            cell = grid[r].get(c)
            if not cell: continue
            if cell["label"] and cell["cs"] == 1 and not name: name = cell["label"]
            if cell["party"] and cell["cs"] == 1 and not party: party = cell["party"]
        key = party or name or top_label
        # עמודה תחת כותרת מקובצת: אם השם הוא רק התווית העליונה המשותפת, נבדיל לפי מיקום
        group = top_label if top and top["cs"] > 1 else None
        if group and key == top_label:
            key = f"{top_label}#{c}"
        if name and party and name != party and cell_is_sub(grid, c):
            key = name  # שם מפורש בשורה העמוקה (למשל Ra'am תחת Joint List) גובר על צבע הקבוצה
        cols.append({"key": key, "label": name or top_label, "group": group})
    return cols, len(h)

def cell_is_sub(grid, c):
    deepest = None
    for r in range(len(grid) - 1, -1, -1):
        cell = grid[r].get(c)
        if cell: deepest = cell; break
    return bool(deepest and deepest["label"] and deepest["cs"] == 1 and len(grid) >= 3)

def parse_table(table):
    rows = rows_of(table)
    cols, nh = header_columns(rows)
    if not cols: return []
    keys = [c["key"] for c in cols]
    if not any(re.search(r"date", k, re.I) for k in keys[:2]): return []
    data, pending = [], {}   # pending: col_index -> (remaining_rows, cellinfo)
    for r in rows[nh:]:
        cells = [cell_parts(c) for k, c in r if k == "d"]
        grid, ci, idx = [None] * len(cols), 0, 0
        def fill_pending():
            nonlocal idx
            while idx < len(cols) and idx in pending:
                rem, info = pending[idx]
                for t in range(info[2]):
                    if idx + t < len(cols): grid[idx + t] = info
                if rem <= 1: del pending[idx]
                else: pending[idx] = (rem - 1, info)
                idx += info[2]
        fill_pending()
        for attrs, content, cs, rs in cells:
            fill_pending()
            if idx >= len(cols): break
            info = (attrs, content, cs, rs)
            for t in range(cs):
                if idx + t < len(cols): grid[idx + t] = info
            if rs > 1: pending[idx] = (rs - 1, info)
            idx += cs
        fill_pending()
        if grid[0] is None: continue
        date = parse_date(grid[0][1], grid[0][0])
        # שורת-אירוע: תא אחד רחב אחרי התאריך
        if grid[1] is not None and grid[1][2] >= 5:
            data.append({"type": "event", "date": date, "text": link_text(strip_refs(grid[1][1]))[:300]}); continue
        lab = [c["label"].lower() for c in cols]
        def idx(word):
            for i, l in enumerate(lab[:5]):
                if word in l: return i
            return None
        fi, pi, si = idx("poll"), idx("publish"), idx("sample")
        meta = [i for i in (0, fi, pi, si) if i is not None]
        firm = link_text(strip_refs(grid[fi][1])) if fi is not None and grid[fi] else None
        pub = link_text(strip_refs(grid[pi][1])) if pi is not None and grid[pi] else None
        samp = None
        if si is not None and grid[si]:
            sv = re.sub(r"<!--.*?-->", "", strip_refs(grid[si][1]))
            sv = re.sub(r"[^\d]", "", sv)
            samp = int(sv) if sv and len(sv) <= 6 else None
        vals, seen = {}, set()
        for i in range(max(meta) + 1, len(cols)):
            info = grid[i]
            if info is None or id(info) in seen: continue
            seen.add(id(info))
            span_keys = [cols[i + t]["key"] for t in range(info[2]) if i + t < len(cols)]
            v = parse_value(info[1])
            if v is not None: vals["+".join(span_keys)] = v
        urls = re.findall(r"url\s*=\s*(https?://[^\s|}]+)", "\n".join(c for _, c in r))
        data.append({"type": "poll", "date": date, "firm": firm, "publisher": pub, "sample": samp, "values": vals, "urls": urls})
    return [{"columns": cols}, data]

if __name__ == "__main__":
    wt = open(sys.argv[1]).read()
    allp = []
    for pos, t in tables(wt):
        res = parse_table(t)
        if not res: continue
        cols, data = res
        line = wt[:pos].count("\n") + 1
        polls = [d for d in data if d["type"] == "poll"]
        print(f"table@{line}: {len(cols['columns'])} cols, {len(polls)} polls, {len(data)-len(polls)} events; cols={[c['key'] for c in cols['columns']]}", file=sys.stderr)
        for d in data: d["table_line"] = line
        allp.extend(data)
    json.dump(allp, open(sys.argv[2], "w"), ensure_ascii=False, indent=0)
