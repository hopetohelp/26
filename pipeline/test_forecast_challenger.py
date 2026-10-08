"""בדיקות עצמאיות לבחירה בזמן אמת ולסף הלא ליניארי."""
import copy
import forecast as F
import forecast_challenger as C


def test_past_only():
    e = {k: F.Election(k, "2000-01-01", (325, 10000), 10000,
                       {"a": 6000, "b": 4000}, {"a": 72, "b": 48}, [], {}) for k in (1, 2, 3)}
    spec = {"gate": {"elections": [1, 2, 3], "unitMinShare": 0.01}}
    rows = [{"knesset": k, "variants": {"V0": {"shares": {"a": 0.6, "b": 0.4}},
                                          "V5": {"shares": {"a": 0.4, "b": 0.6}}}} for k in e]
    bt = {"horizon": 19, "rows": rows}
    before = C.evaluate(bt, spec, e)
    changed = copy.deepcopy(bt)
    changed["rows"][2]["variants"]["V5"]["shares"] = {"a": 0.6, "b": 0.4}
    after = C.evaluate(changed, spec, e)
    assert before["rows"][:2] == after["rows"][:2]
    assert before["rows"][2]["selected"] == after["rows"][2]["selected"] == "baseline"
    assert before["rows"][2]["trainedOn"] == [1, 2]


def test_threshold_before_seats():
    # רשימה אחת מתחת לסף בחלופה א, ואחת מעליו בחלופה ב.
    # ממוצע המנדטים שלהן אינו ההקצאה של ממוצע אחוזי הקולות.
    a = {"large": 0.969, "small": 0.031}
    b = {"large": 0.965, "small": 0.035}
    sh = C.mix(a, b, 0.5)
    se = F.seats_from_shares(sh, [], (325, 10000))
    assert abs(sum(sh.values()) - 1) < 1e-12 and sum(se.values()) == 120
    assert se["small"] == 3
    assert F.seats_from_shares(a, [], (325, 10000))["small"] == 0
    assert C.choose([]) == "baseline"


if __name__ == "__main__":
    test_past_only()
    test_threshold_before_seats()
    print("✅ בחירת חלופה ללא מידע עתידי, והקצאה לאחר שילוב קולות")
