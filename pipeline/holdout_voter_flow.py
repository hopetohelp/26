"""מבחן החזקה למעבר המצביעים (הכרעת בעלים 30.10.2026). שימוש: python3 pipeline/holdout_voter_flow.py raw/compare/yakovpc-flows-30-10-2026.json
טבלת ההשוואה: טבלה ארצית אחת בלי "לא הצביעו" (נתוני yakovpc.com/bchirot, api.php?a=flows). המדד: אחוז הקולות הכשרים של 2026 ששובצו לא נכון.
מסתירים — מסתירים 20% מתתי הקלפי המהימנות, מתאימים את הטבלאות על השאר, וחוזים את הקולות של 2026 בקלפיות המוסתרות"""
import json, random, sys
sys.path.insert(0, "pipeline")
import numpy as np
import voter_flow as vf

Y = json.load(open(sys.argv[1]))["pairs"][-1]
r22, r26 = vf.read(vf.B22), vf.read(vf.B26)
new = list(vf.NEW)
v22 = [vf.vector(r, vf.OLD) for r in r22]
v26 = [vf.vector(r, new) for r in r26]
units = vf.match(r22, r26)
pairs = [vf.unit_pair(t, a, b, r22, r26, v22, v26) for t, a, b in units]
I, J = len(vf.OLD) + 2, len(new) + 2
ids = list(vf.NEW.values())
P_OTHER, P_ABST = J - 2, J - 1

# הטבלה שלו, ממופה לשורות ולעמודות שלנו (בלי "לא הצביעו")
rowmap = {"likud": "מחל", "yesh": "פה", "gantz": "כן", "labor": "אמת", "meretz": "מרצ", "shas": "שס", "utj": "ג", "yb": "ל",
          "rz": "ט", "bennett": "ב", "joint": "ום", "raam": "עם", "balad": "ד"}
colmap = {"likud": "likud", "yesh": "together", "gantz": "yashar", "labor": "democrats", "shas": "shas", "utj": "utj", "yb": "yb",
          "rz": "rzp", "otzma": "otzma", "joint": "joint", "raam": "raam", "miluim": "reservists", "amcha": "amcha", "haredipub": "haredi_public"}
letter2id = vf.NEW
def col_index(c):
    if c in colmap: return ids.index(colmap[c])
    if c.startswith("x26:") and c[4:] in letter2id: return ids.index(letter2id[c[4:]])
    return P_OTHER
T = np.zeros((I - 1, J - 1))  # שורות: OLD + other; עמודות: new + other
oth, w = np.zeros(J - 1), 0.0
for i, rk in enumerate(Y["rows"]):
    row = np.zeros(J - 1)
    for j, c in enumerate(Y["cols"]):
        row[col_index(c)] += Y["T"][i][j]
    if rk in rowmap: T[vf.OLD.index(rowmap[rk])] = row
    else: oth += row * Y["va"][i]; w += Y["va"][i]
T[len(vf.OLD)] = oth / w

def err(pred, act):
    pred = pred * act.sum() / max(pred.sum(), 1e-9)
    return 0.5 * np.abs(pred - act).sum()

subs = [k for k, u in enumerate(units) if u[0] == "sub"]
res = []
for seed in range(5):
    random.seed(seed)
    test = set(random.sample(subs, len(subs) // 5))
    keep = [k for k in range(len(units)) if k not in test]
    Ps = vf.tables([units[k] for k in keep], [pairs[k] for k in keep], r26, I, J)
    # הטבלה של כל יחידה מוסתרת = הטבלה של היישוב שלה (מהיחידות שנשארו), כמו בחישוב באתר
    byplace = {}
    for k, P in zip(keep, Ps):
        r = r26[units[k][2][0]]
        byplace.setdefault(("city", r["סמל ישוב"]), P) if units[k][0] in ("sub", "center", "city") else None
        byplace.setdefault(("com", r["סמל ועדה"]), P) if units[k][0] == "committee" else None
    nat = vf.fit(np.array([pairs[k][0] for k in keep], float), np.array([pairs[k][1] for k in keep], float), vf.prior(I, J), vf.KAPPA)
    eo = et = tot = 0.0
    for k in test:
        x, y = np.array(pairs[k][0], float), np.array(pairs[k][1], float)
        r = r26[units[k][2][0]]
        P = byplace.get(("city", r["סמל ישוב"]), nat)
        act = y[:P_ABST]                      # הקולות הכשרים של 2026
        eo += err((x @ P)[:P_ABST], act)
        et += err(x[:I - 1] @ T, act)       # בלי "לא הצביעו" — כמו אצלו
        tot += act.sum()
    res.append((eo / tot, et / tot, len(test), tot))
    print(f"seed {seed}: ours {100*eo/tot:.2f}%  theirs {100*et/tot:.2f}%  ({len(test)} תתי קלפי, {tot:,.0f} קולות)")
o = np.mean([r[0] for r in res]); t = np.mean([r[1] for r in res])
print(f"ממוצע: אצלנו {100*o:.2f}% קולות שגויים, אצלו {100*t:.2f}%")
