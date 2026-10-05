"""בדיקות המודל: המנוע המהיר זהה למנוע המחקרי, ומודל התצפית משחזר סקרים.

הרצה: python3 pipeline/test_model.py
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bader_ofer import allocate  # noqa: E402
from model import ObsConfig, fast_seats, observe_poll  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def test_official_results():
    """חמש המערכות 2019–2022: המנוע המהיר משחזר את התוצאה הרשמית."""
    for r in json.loads((ROOT / "src" / "data" / "results.json").read_text(encoding="utf-8")):
        names = [l["letters"] for l in r["lists"]]
        votes = [l["votes"] for l in r["lists"]]
        idx = {k: i for i, k in enumerate(names)}
        pairs = [(idx[a], idx[b]) for a, b in r["agreements"]]
        got = fast_seats(votes, r["valid"], pairs)
        assert got == [l["seats"] for l in r["lists"]], r["id"]


def test_random_equivalence():
    """אלפי וקטורי קולות אקראיים (כולל רשימות סביב הסף וזוגות עודפים): זהה למנוע המחקרי."""
    rng = random.Random(7)
    for t in range(3000):
        n = rng.randint(3, 16)
        votes = [rng.choice([rng.randint(0, 200_000), rng.randint(140_000, 175_000), rng.randint(150_000, 1_300_000)])
                 for _ in range(n)]
        valid = sum(votes) + rng.randint(0, 300_000)
        names = [f"L{i}" for i in range(n)]
        k = rng.randint(0, n // 2)
        perm = rng.sample(range(n), 2 * k)
        pairs = [(perm[2 * i], perm[2 * i + 1]) for i in range(k)]
        ref = allocate(dict(zip(names, votes)), valid, [(names[a], names[b]) for a, b in pairs])
        if ref["ties"]:
            continue  # שוויון — הכרעה בהגרלה לפי החוק; מקרה של אפס-מידה בדגימה
        want = [ref["seats"].get(x, 0) for x in names]
        got = fast_seats(votes, valid, pairs)
        assert got == want, (t, votes, valid, pairs, got, want)


def test_observation_recovers_shares():
    """סקר מנדטים שנוצר מאחוזים ידועים: האומדן חוזר לסביבת האחוזים האמיתיים (בלוג-יחס לליכוד)."""
    true = {"likud": 0.20, "a": 0.17, "b": 0.11, "c": 0.09, "d": 0.08, "e": 0.07, "f": 0.065, "g": 0.06,
            "h": 0.05, "i": 0.045, "j": 0.035}
    below = {"k": 0.02}
    names = list(true) + list(below)
    votes = [int((true | below)[k] * 1_000_000) for k in names]
    seats = fast_seats(votes, 1_000_000, [])
    values = {k: ({"s": s} if s else {"p": (true | below)[k] * 100}) for k, s in zip(names, seats)}
    obs = observe_poll("t", "x", 0, values, 1.5, [], "likud", ObsConfig(draws=3000), random.Random(1))
    import math
    assert obs.ess > 50
    for k, sh in true.items():
        if k == "likud":
            continue
        want = math.log(sh / true["likud"])
        assert abs(obs.mean[k] - want) < 0.12, (k, obs.mean[k], want)


def test_backtest_matches_model():
    """בדיקת העבר נוצרה מהגרסה הנוכחית של המודל — אחרת יש להריץ: python3 pipeline/backtest.py"""
    import hashlib
    bt = json.loads((ROOT / "src" / "data" / "backtest.json").read_text(encoding="utf-8"))
    sig = hashlib.sha256((ROOT / "pipeline" / "model.py").read_bytes()).hexdigest()[:16]
    assert bt["modelSignature"] == sig, "המודל השתנה מאז בדיקת העבר — python3 pipeline/backtest.py"
    model = json.loads((ROOT / "src" / "data" / "model.json").read_text(encoding="utf-8"))
    assert model["signature"] == sig


def test_scenarios_sane():
    """המנדטים לפי הממוצע ולפי כל מכון מסתכמים ב-120; שיעורים בין 0 ל-1; כל טווח מסודר."""
    model = json.loads((ROOT / "src" / "data" / "model.json").read_text(encoding="utf-8"))
    sc = model["scenarios"]
    assert sum(model["central"]["seats"].values()) == 120
    for k, v in sc["lists"].items():
        assert 0 <= v["pass"] <= 1, k
        assert v["seats"][0] <= v["seats"][1] <= v["seats"][2], k
        assert v["share"][0] <= v["share"][1] <= v["share"][2], k
    assert sc["bloc"]["seats"][0] <= sc["bloc"]["seats"][1] <= sc["bloc"]["seats"][2]
    for h in model["house"]:
        assert sum(h["seats"].values()) == 120, h["pollster"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("✅", name)
