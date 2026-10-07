"""Direct-source publication embargo uses the actual timestamp, including its timezone."""
from datetime import datetime
from build_data import build_polls

def snapshot(when):
    return {p['id']: p for p in build_polls(datetime.fromisoformat(when))['polls']}

poll_id = '2026-10-07-mp-tm-sn-a-channel-13'
before = snapshot('2026-10-08T20:34:59+03:00')[poll_id]
after = snapshot('2026-10-08T20:35:00+03:00')[poll_id]
assert not before['eligibleToShow']
assert after['eligibleToShow']
assert after['gov'] == 50
assert after['seatSum'] == 120
assert after['sample'] == 1013
assert after['values']['reservists'] == {'p': 2.9}
old = snapshot('2026-10-07T21:02:00+03:00')['2026-10-06-maagar-mochot-channel-16']
assert old['eligibleToShow'] and old['sample'] is None
assert len([p for p in snapshot('2026-10-08T21:00:00+03:00') if p == poll_id]) == 1
print('✅ Direct-source embargo and provenance')
