"""מיזוג תוצאות האימות (raw/verify26/results/*.json) אל raw/verification.json ו-raw/corrections.json.

  python3 raw/verify26/merge.py            — מיזוג
  python3 raw/verify26/merge.py --dry      — סיכום בלבד

כללים: רשומת אימות קיימת נדרסת רק כשהקודמת אינה מאמתת (unreachable / חסרה) והחדשה טובה ממנה.
פער נרשם ב-corrections.json רק עם ערך קודם (שווה לערך הנוכחי בנתונים), ערך חדש ומקור.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw"
RANK = {"unreachable": 0, "mismatch": 1, "partial": 2, "secondary": 3, "corrected": 4, "match": 5}
LAW = ["commissioner", "dates", "moe", "n_asked", "n_participated", "pollster", "population", "questions"]
DETAILS = ["asked_to_participate", "method", "moe", "population", "published", "sample_respondents", "fieldwork", "pollster", "commissioner"]


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p: Path, data) -> None:
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def get_field(poll: dict, field: str):
    cur = poll
    for k in field.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def main() -> None:
    dry = "--dry" in sys.argv
    polls = {p["id"]: p for p in load(ROOT / "src" / "data" / "polls.json")["polls"]}
    ver = load(RAW / "verification.json")
    cor = load(RAW / "corrections.json")
    err = load(RAW / "erroneous-polls.json")
    err_ids = {e["id"] for e in err}
    ver_by = {v["id"]: i for i, v in enumerate(ver)}
    cor_keys = {(c["id"], c["field"]) for c in cor}
    stats = {"new": 0, "replaced": 0, "kept": 0, "corrections": 0, "urls": 0, "skipped_diff": 0, "unknown": 0}
    only = [a for a in sys.argv[1:] if a.startswith("b")]
    for f in sorted((RAW / "verify26" / "results").glob("b*.json")):
        if only and f.stem not in only:
            continue
        for r in load(f):
            pid = r["id"]
            poll = polls.get(pid)
            if poll is None:
                stats["unknown"] += 1
                print("⚠️ סקר לא קיים:", pid)
                continue
            raw_poll = json.loads(json.dumps(poll))
            for c in poll.get("corrections", []):  # הערך שלפני תיקונים קודמים
                parts = c["field"].split(".")
                h = raw_poll
                for k in parts[:-1]:
                    h = h.setdefault(k, {})
                h[parts[-1]] = c["from"]
            if r.get("duplicateOf") and pid not in err_ids:
                err.append({"id": pid, "reason": f"כפילות של {r['duplicateOf']} — אותו סקר, שנקלט פעמיים מדיווחים שונים",
                            "source": r.get("source"), "markedAt": "2026-11-04"})
                err_ids.add(pid)
                stats["duplicates"] = stats.get("duplicates", 0) + 1
            status = r["status"]
            src = r.get("source")
            applied = 0
            for d in r.get("diffs") or []:
                key = (pid, d["field"])
                if key in cor_keys:
                    continue
                cur = get_field(raw_poll, d["field"])
                if cur != d["from"] or not d.get("source"):
                    stats["skipped_diff"] += 1
                    print(f"⚠️ פער לא נרשם {pid} {d['field']}: בנתונים {cur!r}, בתוצאה from={d['from']!r}")
                    continue
                cor.append({"field": d["field"], "from": d["from"], "id": pid, "source": d["source"], "to": d["to"],
                            "reason": d.get("reason") or "אימות מול הפרסום המקורי (סשן ב2, 11.2026)"})
                cor_keys.add(key)
                stats["corrections"] += 1
                applied += 1
            if r.get("foundUrl") and not poll.get("urls") and (pid, "urls") not in cor_keys:
                cor.append({"field": "urls", "from": [], "id": pid, "source": r["foundUrl"], "to": [r["foundUrl"]],
                            "reason": "קישור לפרסום המקורי חסר בנתוני המקור (ויקיפדיה)"})
                cor_keys.add((pid, "urls"))
                stats["urls"] += 1
            elif (r.get("foundUrl") and poll.get("urls") and r["foundUrl"] not in poll["urls"] and (pid, "urls") not in cor_keys
                  and any(w in (r.get("note") or "") for w in ("wrong url", "קישור שגוי", "הקישור שגוי", "קישור שגוי בנתונים"))):
                cor.append({"field": "urls", "from": raw_poll["urls"], "id": pid, "source": r["foundUrl"], "to": [r["foundUrl"]],
                            "reason": "הקישור בנתוני המקור (ויקיפדיה) מוביל לפרסום אחר; הוחלף בקישור לפרסום של הסקר הזה"})
                cor_keys.add((pid, "urls"))
                stats["urls_fixed"] = stats.get("urls_fixed", 0) + 1
            if status == "mismatch" and applied and len(applied_diffs := r.get("diffs") or []) == applied:
                status = "corrected"
            det = r.get("details") or {}
            entry = {
                "access": r.get("access") or (["primary"] if status == "match" else ["secondary"] if status == "secondary" else ["none"]),
                "checkedAt": r.get("checkedAt") or "2026-11-04",
                "id": pid,
                "law16E": {k: bool((r.get("law16E") or {}).get(k)) for k in LAW},
                "note": r.get("note") or "",
                "source": src,
                "sourceDetails": {k: (r.get("published") if k == "published" else det.get(k)) for k in DETAILS},
                "status": status,
            }
            if r.get("scenarioOf"):
                entry["scenarioOf"] = r["scenarioOf"]
            if r.get("fields"):
                entry["fields"] = {g: v for g, v in r["fields"].items() if v and v.get("status")}
                for g, v in entry["fields"].items():
                    if v["status"] == "conflict" and any(c["id"] == pid for c in cor if c["field"].startswith({"seats": "values", "sample": "sample", "dates": "start"}.get(g, "?"))):
                        v["status"] = "corrected"
            if pid in ver_by:
                old = ver[ver_by[pid]]
                if RANK.get(status, 0) > RANK.get(old["status"], 0):
                    ver[ver_by[pid]] = entry
                    stats["replaced"] += 1
                else:
                    stats["kept"] += 1
            else:
                ver_by[pid] = len(ver)
                ver.append(entry)
                stats["new"] += 1
    print(stats)
    if not dry:
        dump(RAW / "verification.json", ver)
        dump(RAW / "corrections.json", cor)
        (RAW / "erroneous-polls.json").write_text("[\n" + ",\n".join("  " + json.dumps(e, ensure_ascii=False) for e in err) + "\n]\n", encoding="utf-8")


if __name__ == "__main__":
    main()
