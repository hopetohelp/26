"""מעבר מצביעים לכל זוג מערכות עוקבות 2013⇐2015 … 2021⇐2022 (תוכנית הנתונים המלאים 04.11.2026, סשן ג).

    python3 pipeline/voter_flows.py            — כותב src/data/flows/kNN.json ו-public/flows/kNN-units.json (NN = הכנסת החדשה)
    python3 pipeline/voter_flows.py --holdout  — מבחן החזקה לכל זוג (כמו pipeline/holdout_voter_flow.py), בלי לכתוב

אותה שיטה בדיוק של pipeline/voter_flow.py (2022⇐2026), על קובצי הקלפיות הרשמיים (pipeline/ballots.py), במבנה של
src/data/flow2026.json. ההבדלים, כי אין להם נתון:
  * נקודת המוצא של הטבלה הארצית אחידה — יש שיוך ודאי בין רשימות (raw/lineage.json) רק ל-2022⇐2026; כאן אין שום הנחה.
  * בקובצי 2013–אפר׳ 2019 אין "ריכוז" ו"סמל ועדה": דרגות המתחם והוועדה ריקות, והיתרה עולה ליישוב ולארץ.
  * המעטפות החיצוניות (סמל ישוב 875 / 99999 / 9999) מאוחדות לסמל אחד, כדי שיותאמו זו לזו.
רשימות: ב"לפני" — שעברו את אחוז החסימה או קיבלו לפחות 2.5% (כמו ב-2022); ב"אחרי" — שעברו או קיבלו לפחות 1%; השאר ⇐ "other".
המפתחות כמו ב-flow2026.json (letters26, ballots2026, valid2026 — של המערכת החדשה); new = אותיות הרשימות, names = שמותיהן.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ballots  # noqa: E402
import voter_flow as vf  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT, UNITS = ROOT / "src" / "data" / "flows", ROOT / "public" / "flows"
PAIRS = [(19, 20), (20, 21), (21, 22), (22, 23), (23, 24), (24, 25)]
OLD_MIN, NEW_MIN = 2.5, 1.0


def rows(n: int) -> list[dict]:
    """שורות הקלפי בשמות העמודות של voter_flow.py"""
    out = []
    for r in ballots.read(n):
        out.append({"סמל ישוב": "9999" if r["external"] else r["code"], "שם ישוב": r["name"], "קלפי": r["ballot"] or "0",
                    "ריכוז": r["center"], "סמל ועדה": "99" if r["external"] else (r["committee"] or ""),
                    "בזב": r["eligible"], "מצביעים": r["voted"], "כשרים": r["valid"], "פסולים": r["invalid"], **r["votes"]})
    return out


def lists(e: dict, minimum: float) -> list[str]:
    return [l["letters"] for l in sorted(e["lists"], key=lambda l: -l["votes"]) if l["seats"] or l["votes"] / e["valid"] * 100 >= minimum]


def results() -> dict[int, dict]:
    return {e["knesset"]: e for e in json.loads(vf.RESULTS.read_text(encoding="utf-8"))}


def build(a: int, b: int, res: dict[int, dict]) -> tuple[dict, dict]:
    ea, eb = res[a], res[b]
    old, new = lists(ea, OLD_MIN), lists(eb, NEW_MIN)
    ra, rb = rows(a), rows(b)
    nat, units, Ps = vf.national(ra, rb, old, new, uniform=True)
    names = lambda e: {l["letters"]: l["short"] for l in e["lists"]}
    d = eb["date"].split("-")
    data = {
        "knesset": b, "prev": a, "asOf": f"{int(d[2])}/{int(d[1])}/{d[0]}",
        "old": old + ["other", "abstain", "new"],
        "new": new + ["other", "abstain"],
        "letters26": {l: l for l in new},
        "names": {"old": {k: v for k, v in names(ea).items() if k in old}, "new": {k: v for k, v in names(eb).items() if k in new}},
        "ballots2026": len(rb),
        "valid2026": sum(r["כשרים"] for r in rb),
        "counted": {"pct": 100.0, "time": "", "eligible": sum(r["בזב"] for r in rb), "voters": sum(r["מצביעים"] for r in rb),
                    "invalid": sum(r["פסולים"] for r in rb)},
        "national": nat,
        # סדר קבוע (סדר ההצמדה תלוי בגיבוב של פייתון): אותו קובץ בכל הרצה
        "cities": dict(sorted(vf.cities(ra, rb, units, Ps, old, new).items(), key=lambda kv: int(kv[0]))),
        "prior": "uniform",
        "sources": {f"k{a}": ballots.SOURCES[a], f"k{b}": ballots.SOURCES[b]},
    }
    check(data, ea, eb, old, new)
    return data, vf.units_file(ra, rb, old, new)


def check(data: dict, ea: dict, eb: dict, old: list[str], new: list[str]) -> None:
    """אף קול לא יוצא מהחשבון: עמודות flows = התוצאה הרשמית החדשה; שורות flowsTo = התוצאה הרשמית הקודמת"""
    F, T = np.array(data["national"]["flows"]), np.array(data["national"]["flowsTo"])
    vb = {l["letters"]: l["votes"] for l in eb["lists"]}
    va = {l["letters"]: l["votes"] for l in ea["lists"]}
    for j, l in enumerate(new):
        assert F[:, j].sum() == vb[l], (eb["knesset"], l)
    assert F[:, len(new)].sum() == eb["valid"] - sum(vb[l] for l in new), (eb["knesset"], "other")
    for i, l in enumerate(old):
        assert T[i].sum() == va[l], (ea["knesset"], l)
    assert T[len(old)].sum() == ea["valid"] - sum(va[l] for l in old), (ea["knesset"], "other")


def holdout(a: int, b: int, res: dict[int, dict], seeds: int = 3) -> dict:
    """מסתירים 20% מתתי הקלפי המהימנות, מתאימים על השאר וחוזים את קולות המערכת החדשה בקלפיות המוסתרות.
    המדד: אחוז הקולות הכשרים ששובצו לא נכון. להשוואה — טבלה ארצית אחת (בלי הדרגות)."""
    old, new = lists(res[a], OLD_MIN), lists(res[b], NEW_MIN)
    ra, rb = rows(a), rows(b)
    v22, v26 = [vf.vector(r, old) for r in ra], [vf.vector(r, new) for r in rb]
    units = vf.match(ra, rb)
    pairs = [vf.unit_pair(t, x, y, ra, rb, v22, v26) for t, x, y in units]
    I, J = len(old) + 2, len(new) + 2
    base = np.full((I, J), 1 / J)
    err = lambda p, act: 0.5 * np.abs(p * act.sum() / max(p.sum(), 1e-9) - act).sum()
    subs = [k for k, u in enumerate(units) if u[0] == "sub"]
    out = []
    for seed in range(seeds):
        random.seed(seed)
        test = set(random.sample(subs, len(subs) // 5))
        keep = [k for k in range(len(units)) if k not in test]
        Ps = vf.tables([units[k] for k in keep], [pairs[k] for k in keep], rb, I, J, base=base)
        byplace = {}
        for k, P in zip(keep, Ps):
            if units[k][0] in ("sub", "center", "city"):
                byplace.setdefault(rb[units[k][2][0]]["סמל ישוב"], P)
        nat = vf.fit(np.array([pairs[k][0] for k in keep], float), np.array([pairs[k][1] for k in keep], float), base, vf.KAPPA)
        eo = en = tot = 0.0
        for k in test:
            x, y = np.array(pairs[k][0], float), np.array(pairs[k][1], float)
            P = byplace.get(rb[units[k][2][0]]["סמל ישוב"], nat)
            act = y[: J - 1]
            eo += err((x @ P)[: J - 1], act)
            en += err((x @ nat)[: J - 1], act)
            tot += act.sum()
        out.append((eo / tot, en / tot))
    tiers = {t: 0 for t in vf.TIERS}
    for t, _, y in units:
        tiers[t] += sum(rb[i]["כשרים"] for i in y)
    return {"pair": f"k{a}⇐k{b}", "misassigned": round(100 * float(np.mean([o for o, _ in out])), 2),
            "nationalOnly": round(100 * float(np.mean([n for _, n in out])), 2), "heldOutSubs": len(subs) // 5,
            "subShare": round(100 * tiers["sub"] / sum(tiers.values()), 1)}


def main() -> int:
    res = results()
    if "--holdout" in sys.argv:
        for a, b in PAIRS:
            if a in res and b in res:
                print(json.dumps(holdout(a, b, res), ensure_ascii=False), flush=True)
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    UNITS.mkdir(parents=True, exist_ok=True)
    for a, b in PAIRS:
        if a not in res or b not in res:
            print(f"k{a}⇐k{b}: אין תוצאה ארצית ב-results.json — דילוג")
            continue
        data, units = build(a, b, res)
        (OUT / f"k{b}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        (UNITS / f"k{b}-units.json").write_text(json.dumps(units, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"k{a}⇐k{b}:", {t: v["valid"] for t, v in data["national"]["tiers"].items()}, "cities", len(data["cities"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
