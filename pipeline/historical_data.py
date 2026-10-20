"""תוצאות לפי יישוב מהקבצים הרשמיים; ללא ייחוס מעטפות חיצוניות ליישוב."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'raw'
META_COLUMNS = {'סמל ועדה', 'שם ישוב', 'סמל ישוב', 'בזב', 'מצביעים', 'פסולים', 'כשרים', ''}

def locality_rows(n):
    path = RAW / 'cec' / f'k{n}_expc.csv'
    raw = path.read_bytes()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1255')
    rows = []
    for r in csv.DictReader(text.splitlines()):
        code = r['סמל ישוב'].strip()
        external = code in ('0', '9999') or 'מעטפות' in r['שם ישוב']
        rows.append({'code': code, 'name': 'מעטפות חיצוניות' if external else r['שם ישוב'].strip(),
                     'external': external, 'eligible': int(r['בזב']), 'voted': int(r['מצביעים']),
                     'valid': int(r['כשרים']), 'invalid': int(r['פסולים']),
                     'votes': {k: int(v or 0) for k, v in r.items() if k not in META_COLUMNS}})
    return rows

def national_2015():
    rows = locality_rows(20)
    metadata = json.loads((RAW / 'cec' / 'k20_metadata.json').read_text())
    votes = {k: sum(r['votes'][k] for r in rows) for k in rows[0]['votes']}
    return {**{k: sum(r[k] for r in rows) for k in ('eligible', 'voted', 'valid', 'invalid')},
            'lists': [{'letters': k, 'name': metadata['names'].get(k, k), 'short': metadata['names'].get(k, k),
                       'votes': v, 'seats': metadata['seats'].get(k, 0)} for k, v in votes.items() if v],
            'url': metadata['source']}

def build_localities(results, sha256):
    elections = []
    for e in results:
        n = e['knesset']
        rows = locality_rows(n)
        for row in rows:
            assert sum(row['votes'].values()) == row['valid'], (n, row['code'], 'valid')
            assert row['voted'] == row['valid'] + row['invalid'], (n, row['code'], 'voted')
        for k in ('voted', 'valid', 'invalid'):
            assert sum(r[k] for r in rows) == e[k], (n, k)
        for l in e['lists']:
            assert sum(r['votes'].get(l['letters'], 0) for r in rows) == l['votes'], (n, l['letters'])
        assert len({r['code'] for r in rows}) == len(rows), (n, 'duplicate locality')
        elections.append({'id': e['id'], 'label': e['label'], 'date': e['date'],
                          'source': e['source']['url'] if n == 20 else f'https://media{n}.bechirot.gov.il/files/expc.csv',
                          'sha256': sha256(RAW / 'cec' / f'k{n}_expc.csv'),
                          'eligibleInLocalityFile': sum(r['eligible'] for r in rows),
                          'eligibleNational': e['eligible'],
                          'lists': [{'letters': l['letters'], 'name': l['short']} for l in e['lists']],
                          'rows': sorted(rows, key=lambda r: (r['external'], r['name']))})
    return {'elections': elections}

def history_2015(election, sha256):
    """אותם תמלולים מתועדים המשמשים למחקר; בלי לפרש שוב טבלת ויקי עם תאים מאוחדים."""
    records = {}
    for path in sorted((RAW / 'forecast' / 'verification').glob('k19_k20_*_results.json')):
        records.update({r['id']: r for r in json.loads(path.read_text()) if r['id'].startswith('k20-')})
    names = {'panels_politics': 'פאנלס פוליטיקס', 'kantar': 'טלסקר (קנטר)', 'smith': 'סמית׳',
             'midgam': 'מדגם מחקר וייעוץ', 'dialog': 'דיאלוג', 'geocartography': 'גאוקרטוגרפיה',
             'maagar_mochot': 'מאגר מוחות', 'tri': 'טרי', 'midgam_project': 'פרויקט מדגם', 'new_wave': 'הגל החדש'}
    publishers = [('army radio', 'גלי צה״ל'), ('bizportal', 'ביזפורטל'), ('channel 10', 'חדשות 10'),
                  ('nana 10', 'נענע 10 / חדשות 10'), ('channel 1', 'ערוץ 1'), ('channel 2', 'חדשות 2'),
                  ('globes', 'גלובס'), ('haaretz', 'הארץ'), ('maariv', 'מעריב / ג׳רוזלם פוסט'),
                  ('knesset channel', 'ערוץ הכנסת'), ('kol barama', 'קול ברמה'), ('makor rishon', 'מקור ראשון / אנרג׳י'),
                  ('reshet bet', 'רשת ב׳'), ('times of israel', 'טיימס אוף ישראל'), ('walla', 'וואלה'),
                  ('yedioth', 'ידיעות אחרונות / וויינט'), ('yisrael hayom', 'ישראל היום'), ('i24news', 'i24NEWS')]
    path = RAW / 'forecast' / 'polls.json'
    polls = []
    for p in json.loads(path.read_text()):
        if p['knesset'] != 20:
            continue
        r = records[p['id']]
        firm_key = '202_strategies' if (r.get('firm') or '').startswith('202 Strategies') else p['series']
        names['202_strategies'] = '202 סטרטג׳יז'
        pub = next((he for key, he in publishers if key in (r.get('publisher') or '').lower()), None)
        if r.get('publisher') and not pub:
            raise ValueError(r['publisher'])
        # התאריך במזהה הוא תאריך הפרסום בטבלת המקור; לא ממציאים יום עבודת שטח.
        published = p['id'][4:14]
        end = r.get('fieldEnd') or published
        if end >= election['date']:
            continue
        total = sum(v.get('s', 0) for v in p['values'].values())
        polls.append({'id': p['id'], 'start': r.get('fieldStart') or end, 'end': end,
                      'dateBasis': 'fieldwork' if r.get('fieldEnd') else 'publication', 'published': published,
                      'firmKey': firm_key, 'firmHe': names.get(firm_key, 'מכון לא צוין'), 'publisherHe': pub,
                      'values': p['values'], 'seatSum': total, 'consistent': 118 <= total <= 122,
                      'verificationStatus': p['status'],
                      'urls': __import__('re').findall(r'https?://[^\s;()]+', p.get('source') or '')[:3]})
    return {'id': 'k20', 'knesset': 20, 'date': election['date'], 'label': election['label'],
            'recommendedNetanyahu': ['מחל', 'כ', 'טב', 'שס', 'ל', 'ג'],
            'recommendedSource': 'https://www.mako.co.il/news-military/politics-q1_2015/Article-025660aad454c41004.htm',
            'polls': sorted(polls, key=lambda p: (p['end'], p['id']), reverse=True),
            'source': {'page': 'Opinion polling for the 2015 Israeli legislative election; תמלולי הפרסומים ב-raw/forecast/verification',
                       'sha256': sha256(path), 'tableLine': 1}}
