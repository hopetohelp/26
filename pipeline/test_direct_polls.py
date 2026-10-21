"""Published polls are immediately visible, with no 24-hour delay."""
from datetime import datetime
from build_data import build_polls

def snapshot(when):
    return {p['id']: p for p in build_polls(datetime.fromisoformat(when))['polls']}

poll_id = '2026-10-07-mp-tm-sn-a-channel-13'
before = snapshot('2026-10-07T20:35:00+03:00')[poll_id]
after = snapshot('2026-10-08T20:35:00+03:00')[poll_id]
assert before['eligibleToShow']
assert after['eligibleToShow']
assert all(p['eligibleToShow'] for p in snapshot('2026-10-07T20:35:00+03:00').values())
assert after['gov'] == 50
assert after['seatSum'] == 120
assert after['sample'] == 1013
assert after['values']['reservists'] == {'p': 2.9}
old = snapshot('2026-10-07T21:02:00+03:00')['2026-10-06-maagar-mochot-channel-16']
assert old['eligibleToShow'] and old['sample'] is None
assert len([p for p in snapshot('2026-10-08T21:00:00+03:00') if p == poll_id]) == 1
print('✅ Immediate publication and provenance')

# הפניה (<ref>) שנשברה לכמה שורות בוויקיפדיה אינה מזיזה את עמודות הטבלה
from wiki_tables import rows_of
_table = """{|
|-
|{{Opdrts||20|Oct|2026}}
| SF+ND
|Channel 14<ref name="x">{{cite web|date=20 October 2026|title=כותרת
|url=https://example.com/a|work=Channel 14}}</ref>
|454
|style="background:#BBCDE4" |'''30'''
|9
|}"""
_row = rows_of(_table)[0]
assert len(_row) == 6 and _row[3][1].strip() == '454', _row
print('✅ Multi-line wiki reference keeps table columns')
