"""מיקומי קלפיות 2026: טופס הוועדה המקורי (XLSX) ⇐ JSON ציבורי, ללא תלות בספריות חיצוניות.

עותק המקור: harelc/elections-vote-transfer, commit d01bfca3ca8b52dbf812de9e2236cf81317bb594,
data/k26_cec/stations.xlsx. קובץ הוועדה, 12,018 קלפיות (מספר בעלי הזכות תואם לקובץ התוצאות).
python3 pipeline/ballot_locations.py
"""
import json
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'raw' / 'ballot-locations-2026.xlsx'
OUTPUT = ROOT / 'public' / 'ballot-locations.json'
SNAPSHOT = 'https://github.com/harelc/elections-vote-transfer/blob/d01bfca3ca8b52dbf812de9e2236cf81317bb594/data/k26_cec/stations.xlsx'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def number(v):
    # Excel שומר לעיתים 283.1 בתור 283.10000000000002.
    return format(Decimal(str(v)).quantize(Decimal('0.001')).normalize(), 'f')


def read_locations(path=SOURCE):
    with ZipFile(path) as z:
        shared = ET.fromstring(z.read('xl/sharedStrings.xml'))
        strings = [''.join(si.itertext()) for si in shared]
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.findall('s:sheetData/s:row', NS):
        values = {}
        for cell in row.findall('s:c', NS):
            v = cell.find('s:v', NS)
            if v is not None:
                values[''.join(c for c in cell.attrib['r'] if c.isalpha())] = strings[int(v.text)] if cell.get('t') == 's' else v.text
        rows.append(values)
    headers = rows[0]
    out = {}
    for row in rows[1:]:
        r = {headers.get(k, k): v.strip() for k, v in row.items()}
        if not r.get('סמל ישוב בחירות') or not r.get('סמל קלפי'):
            continue
        code, ballot = number(r['סמל ישוב בחירות']), number(r['סמל קלפי'])
        name, address = r.get('מקום קלפי', ''), r.get('כתובת קלפי', '').replace(',', ' ').strip()
        key = f'{code}:{ballot}'
        if key in out:
            raise ValueError(f'קלפי כפולה: {key}')
        out[key] = {'venue': name, 'address': address, 'center': number(r['סמל רכוז']), 'eligible': int(r['בוחרי כנסת'])}
    return out


def main():
    locations = read_locations()
    old = json.loads((ROOT / 'raw' / 'ballot-addresses-2022.json').read_text(encoding='utf-8'))
    locations22 = {f'{code}:{number(ballot)}': address.replace(',', ' ').strip()
                   for code, ballots in old.items() for ballot, address in ballots.items()}
    data = {'about': {'year': 2026, 'source': 'ועדת הבחירות המרכזית — רשימת קלפיות', 'snapshot': SNAPSHOT},
            'locations': locations, 'locations22': locations22}
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'מיקומי קלפיות 2026: {len(locations):,}')


if __name__ == '__main__':
    main()
