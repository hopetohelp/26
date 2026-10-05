"""חלוקת מנדטים לפי חוק הבחירות לכנסת: אחוז חסימה, הסכמי עודפים, באדר-עופר.
אב-טיפוס מחקרי (Python) — המימוש באתר ייכתב מחדש ב-TypeScript עם אותן בדיקות.
"""
from fractions import Fraction

def dhondt(votes: dict, seats: int, initial: dict, total_votes: int | None = None) -> dict:
    """סעיף 81(ד): כל מנדט נותר — לרשימה עם "מודד הרשימה" (קולות ÷ (מנדטים+1)) הגדול ביותר.
    81(ד)(4): רשימה שלא קיבלה יותר ממחצית הקולות וזכתה במחצית המנדטים — יוצאת מהחלוקה.
    שוויון: החוק — הגרלה של הוועדה; כאן מסומן ב-ties ונשבר לפי מספר הקולות."""
    alloc = dict(initial)
    out_of_race, ties = set(), []
    total = total_votes if total_votes is not None else sum(votes.values())
    while sum(alloc.values()) < seats:
        for k in votes:
            if 2 * votes[k] <= total and 2 * alloc[k] >= seats: out_of_race.add(k)
        cands = [k for k in votes if k not in out_of_race]
        q = {k: Fraction(votes[k], alloc[k] + 1) for k in cands}
        top = max(q.values())
        tied = [k for k in cands if q[k] == top]
        if len(tied) > 1: ties.append(tuple(sorted(map(str, tied))))
        best = max(tied, key=lambda k: votes[k])
        alloc[best] += 1
    alloc["__ties__"] = ties
    return alloc

def allocate(votes: dict, valid_total: int, agreements: list[tuple[str, str]],
             threshold=Fraction(325, 10000), seats=120) -> dict:
    # 1. אחוז החסימה — מתוך כלל הקולות הכשרים
    passing = {k: v for k, v in votes.items() if v >= threshold * valid_total}
    total_passing = sum(passing.values())
    quota = total_passing // seats                  # 81(ב): "המספר השלם היוצא מן החילוק"
    # 2. 81(ג): מנדטים שלמים לכל רשימה בנפרד
    whole = {k: v // quota for k, v in passing.items()}
    # 3. הסכמי עודפים: זוג שבו שתי הרשימות עברו את החסימה נחשב רשימה אחת לחלוקת העודפים
    pairs = [(a, b) for a, b in agreements if a in passing and b in passing]
    in_pair = {x for p in pairs for x in p}
    units = {k: passing[k] for k in passing if k not in in_pair}
    units_init = {k: whole[k] for k in units}
    for a, b in pairs:
        units[(a, b)] = passing[a] + passing[b]
        units_init[(a, b)] = whole[a] + whole[b]
    unit_seats = dhondt(units, seats, units_init, total_passing)
    ties = unit_seats.pop("__ties__")
    result = {k: unit_seats[k] for k in passing if k not in in_pair}
    # 4. חלוקה פנימית בתוך כל זוג — באותה שיטה, מנדטים שלמים לפי מודד הזוג ואז עודפים
    # 4. 82(ב): חלוקה פנימית בזוג "לפי שיטת החלוקה הקבועה בסעיף 81" — מודד זוג שלם, שלמים, עודפים
    for a, b in pairs:
        s = unit_seats[(a, b)]
        if s == 0:
            result.update({a: 0, b: 0}); continue
        pq = (passing[a] + passing[b]) // s
        init = {a: passing[a] // pq, b: passing[b] // pq}
        inner = dhondt({a: passing[a], b: passing[b]}, s, init)
        ties += inner.pop("__ties__")
        result.update(inner)
    return {"seats": result, "quota": quota, "passing_total": total_passing, "ties": ties,
            "wasted": valid_total - total_passing, "threshold_votes": threshold * valid_total}
