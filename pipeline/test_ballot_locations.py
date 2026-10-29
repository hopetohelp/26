"""התאמה לקובץ המקורי ולתוצאות הוועדה, ללא כתיבת נתונים."""
import csv
import json
from ballot_locations import ROOT, OUTPUT, read_locations, number

locations = read_locations()
assert len(locations) == 12018
assert locations == json.loads(OUTPUT.read_text(encoding='utf-8'))['locations']
assert locations['3000:576.1'] == {'venue': 'בי"ס בית יעקב - נווה גרשון', 'address': 'בלבן מאיר 6', 'center': '42', 'eligible': 609}
with (ROOT / 'raw' / 'ballots-2026.csv').open(encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
for r in rows:
    if r['סמל ישוב'] == '9999':
        continue
    key = f"{number(r['סמל ישוב'])}:{number(r['קלפי'])}"
    assert key in locations, key
    assert locations[key]['eligible'] == int(r['בזב']), key
    assert locations[key]['venue'] and locations[key]['address'], key
print('✓ כל הקלפיות שנספרו תואמות לקובץ המיקומים, כולל מספר בעלי הזכות; פלט דטרמיניסטי')
