"""Per-field verification, conflict checks and the corrections log (Codex review 12.10.2026)."""
import json
from datetime import datetime
from pathlib import Path

from build_data import FIELD_AFFECTS, apply_field_checks, build_quality, field_group

OUT = Path(__file__).resolve().parent.parent / "src" / "data"


def poll(**kw):
    base = {"id": "p", "firmHe": "מכון", "publisherHe": "מזמין", "end": "2026-10-01", "sample": 1000, "consistent": True,
            "eligibleToShow": True, "seatSum": 120, "urls": ["u"], "verification": None, "corrections": None}
    base.update(kw)
    return base


def ver(status="match", **details):
    return {"status": status, "source": "src", "details": details}


assert [field_group(f) for f in ("values.shas.s", "values.shas.p", "others.pct", "gov", "sample", "start", "end", "firmHe")] == \
    ["seats", "pct", "pct", "seats", "sample", "dates", "dates", "pollster"]

# poll with neither verification nor corrections: no per-field record
p = poll()
apply_field_checks([p])
assert "fieldChecks" not in p

# overall check only: never reported as a per-field match
p = poll(verification=ver())
apply_field_checks([p])
assert {g: c["status"] for g, c in p["fieldChecks"].items()} == {"seats": "overall", "pct": "overall", "sample": "overall", "dates": "overall"}

# sample conflict, even when the main field was corrected
p = poll(sample=1263, verification=ver(sample_respondents=1013), corrections=[{"field": "sample", "from": 1013, "to": 1263, "source": "gov"}])
apply_field_checks([p])
assert p["fieldChecks"]["sample"]["status"] == "conflict"

# equal sample is a measured match; a corrected field carries the correction source
p = poll(sample=1100, verification=ver(sample_respondents=1100), corrections=[{"field": "values.x.p", "from": 1.9, "to": 0.9, "source": "gov-report"}])
apply_field_checks([p])
assert p["fieldChecks"]["sample"]["status"] == "match"
assert p["fieldChecks"]["pct"] == {"status": "corrected", "source": "gov-report"}
assert p["fieldChecks"]["seats"]["status"] == "overall"

# unverified poll with a correction: only the corrected group is known
p = poll(corrections=[{"field": "end", "from": "a", "to": "b", "source": "gov"}])
apply_field_checks([p])
assert p["fieldChecks"]["dates"]["status"] == "corrected" and p["fieldChecks"]["seats"]["status"] == "none"

# quality: conflicts and corrections log, with what each correction affects
good = poll(id="a")
bad = poll(id="b", consistent=False, seatSum=601, end="2026-08-24", eligibleToShow=False, erroneous={"reason": "x", "source": "s", "markedAt": "2026-10-12"})
old = poll(id="c", end="2026-05-01", corrections=[{"field": "sample", "from": 1, "to": 2, "source": "s"}])
for x in (good, bad, old):
    x.setdefault("fieldChecks", None)
q = build_quality([good, bad, old], {"start": "2026-09-09", "polls": 3, "skipped": []}, datetime.fromisoformat("2026-10-12T12:00:00+03:00"))
assert q["coverage"]["total"] == 3 and q["coverage"]["usable"] == 2 and q["coverage"]["model"]["used"] == 3
assert [c["id"] for c in q["conflicts"]] == ["b"] and "601" in q["conflicts"][0]["detail"]
assert len(q["corrections"]) == 1 and q["corrections"][0]["affects"] == ["ארכיון הסקרים"]  # before list submission: no model/forecast
assert set(FIELD_AFFECTS) >= {"seats", "pct", "sample", "dates", "pollster", "other"}

# the real build: every poll with a verification record has per-field checks; every correction is in the log
polls = json.loads((OUT / "polls.json").read_text(encoding="utf-8"))["polls"]
quality = json.loads((OUT / "quality.json").read_text(encoding="utf-8"))
assert all("fieldChecks" in p for p in polls if p.get("verification") or p.get("corrections"))
assert len(quality["corrections"]) == sum(len(p.get("corrections") or []) for p in polls)
assert quality["coverage"]["total"] == len(polls)
assert not any(c["id"] == "2026-10-07-sf-nd-channel-14" and c["group"] == "sample" for c in quality["conflicts"])
print("✅ Per-field verification, conflicts and corrections log")

# מדגמי יום הבחירות אינם סקרים: אף סקר ברשימה אינו מתאריך יום הבחירות, והמדגמים נשמרים בנפרד (הכרעת בעלים 28.10.2026)
from build_data import ELECTION_DAY_2026
assert not [p["id"] for p in polls if p["end"] >= ELECTION_DAY_2026]
print("✅ Exit polls are kept out of the polls list")
