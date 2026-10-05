"""בדיקות מודל החיזוי: המדדים, רכיב המגמה, ושלמות יומן ההרצות.

יומן ההרצות (pipeline/forecast_runs.jsonl) הוא הבסיס לגילוי הנאות — לכן נבדק שכל שורה תקינה, שהסדר נשמר, ושהשורה
האחרונה של המפרט, הקוד והנתונים הנוכחיים משוחזרת בדיוק בהרצה חוזרת.
הרצה: python3 pipeline/test_forecast.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import forecast as F  # noqa: E402

LOG = Path(__file__).resolve().parent / "forecast_runs.jsonl"
FIELDS = {"runAt", "commit", "dirty", "specVersion", "specSha", "codeSha", "dataSha", "horizon", "valid", "passed",
          "summary", "perElection"}


def rows():
    return [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip()] if LOG.exists() else []


def test_metrics():
    a = {"x": 0.5, "y": 0.3, "z": 0.15}
    assert F.vote_accuracy(a, a, 0.01) == 1
    # טעות של 2 נקודות שעוברות מרשימה לרשימה = 98%
    assert abs(F.vote_accuracy({"x": 0.52, "y": 0.28, "z": 0.15}, a, 0.01) - 0.98) < 1e-9
    assert F.seat_accuracy({"x": 61, "y": 59}, {"x": 60, "y": 60}) == 1 - 2 / 240


def test_momentum_learns_continuation():
    """תנועה שהמשיכה במלואה בעבר ⇐ β חיובי (מכווץ); תנועה שהתהפכה ⇐ β שלילי."""
    spec = F.load_spec()
    def hist(sign):
        out = []
        for k in (1, 2, 3):
            e = F.Election(k, "2000-01-01", (1, 100), 1000, {"x": 500 + sign * 30, "y": 500 - sign * 30}, {}, [], {})
            polls = {"a": {"x": 0.5, "y": 0.5}, "b": {"x": 0.5, "y": 0.5}, "c": {"x": 0.5, "y": 0.5}}
            out.append((e, polls, {"x": 0.03, "y": -0.03}))
        return out
    up, n = F.fit_momentum(hist(+1), spec)
    down, _ = F.fit_momentum(hist(-1), spec)
    assert n == 3 and up > 0 > down, (up, down)


def test_log_integrity():
    rs = rows()
    for r in rs:
        assert FIELDS <= set(r), sorted(FIELDS - set(r))
        assert not r["dirty"], f"הרצה מקוד שלא נשמר בקומיט: {r['runAt']}"
    assert [r["runAt"] for r in rs] == sorted(r["runAt"] for r in rs), "היומן אינו בסדר כרונולוגי"
    assert [r["specVersion"] for r in rs] == sorted(r["specVersion"] for r in rs), "גרסת מפרט ירדה"


def test_latest_run_reproduces():
    """השורה האחרונה שנרשמה עם המפרט, הקוד והנתונים של היום — משוחזרת בדיוק."""
    spec = F.load_spec()
    shas = (F.file_sha(F.SPEC_PATH), F.file_sha(Path(F.__file__)), F.file_sha(F.RAW / "forecast" / "polls.json"))
    mine = [r for r in rows() if (r["specSha"], r["codeSha"], r["dataSha"]) == shas]
    if not mine:
        print("   (אין הרצה רשומה לגרסה הנוכחית — אין מה לשחזר)")
        return
    r = mine[-1]
    out = F.run_backtest(spec, r["horizon"])
    assert out["passed"] == r["passed"] and out["summary"] == r["summary"], "ההרצה החוזרת שונה מהיומן"


def test_published_disclosure_is_logged():
    """הבדיקה שמוצגת באתר (forecast.json) זהה להרצה רשמית ביומן — אין גילוי נאות מהרצה שלא נרשמה."""
    path = F.ROOT / "src" / "data" / "forecast.json"
    if not path.exists():
        return
    fc = json.loads(path.read_text(encoding="utf-8"))
    assert fc["gate"]["atHorizon"]["logged"], f"אופק {fc['horizon']} של גרסה {fc['specVersion']} לא נרשם ביומן"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("✅", name)
