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

def national_2013():
    """2013: הסיכום הארצי מקובץ הקלפיות הרשמי (כולל המעטפות החיצוניות); שמות ומנדטים — k19_metadata.json."""
    import ballots
    rows = ballots.read(19)
    ballots.check_rows(19, rows)
    metadata = json.loads((RAW / 'cec' / 'k19_metadata.json').read_text())
    votes = {}
    for r in rows:
        for k, v in r['votes'].items():
            votes[k] = votes.get(k, 0) + v
    return {**{k: sum(r[k] for r in rows) for k in ('eligible', 'voted', 'valid', 'invalid')},
            'lists': [{'letters': k, 'name': metadata['names'][k], 'short': metadata['names'][k],
                       'votes': v, 'seats': metadata['seats'].get(k, 0)} for k, v in votes.items() if v],
            'url': metadata['source']}


def previous_2009(sha256):
    """2009 (הכנסת ה-18) — הנתונים הכלליים ל"מה השתנה" של 2013 והרשימות למעבר המצביעים 2009⇐2013 (2009 אינה בבורר),
    מקובץ הקלפיות הרשמי (pipeline/ballots.py). שמות ומנדטים — k18_metadata.json (המכון הישראלי לדמוקרטיה, הוצלב).
    בעלי זכות הבחירה = סכום הקלפיות בלי שורת המעטפות הכפולות (בה בז"ב = מספר המצביעים); אחוז החסימה אז 2%."""
    import ballots
    rows = ballots.read(18)
    ballots.check_rows(18, rows)
    external = [r for r in rows if r['external']]
    assert len(external) == 1 and external[0]['eligible'] == external[0]['voted'], 'k18 external envelopes row'
    metadata = json.loads((RAW / 'cec' / 'k18_metadata.json').read_text(encoding='utf-8'))
    votes = {}
    for r in rows:
        for k, v in r['votes'].items():
            votes[k] = votes.get(k, 0) + v
    valid = sum(r['valid'] for r in rows)
    below = sum(v for v in votes.values() if 100 * v < 2 * valid)
    lists = sorted(({'letters': k, 'name': metadata['names'][k], 'short': metadata['names'][k], 'votes': v,
                     'seats': metadata['seats'].get(k, 0)} for k, v in votes.items() if v), key=lambda l: -l['votes'])
    assert sum(l['seats'] for l in lists) == 120, 'k18 seats'
    out = {'knesset': 18, 'label': '2009', 'full': 'פברואר 2009', 'date': '2009-02-10',
           'eligible': sum(r['eligible'] for r in rows if not r['external']),
           'voted': sum(r['voted'] for r in rows), 'valid': valid, 'invalid': sum(r['invalid'] for r in rows),
           'belowThreshold': below, 'thresholdMilli': 2000, 'lists': lists,
           'namesAndSeatsSource': metadata['namesAndSeatsSource'], 'status': metadata['status'],
           'source': ballots.SOURCES[18], 'sha256': sha256(ballots.FILES[18])}
    # הסיכום הרשמי (ועדת הבחירות; המכון הישראלי לדמוקרטיה): 5,278,985 · 3,416,587 · 3,373,490 · 43,097
    assert (out['eligible'], out['voted'], out['valid'], out['invalid']) == (5278985, 3416587, 3373490, 43097), out
    return out


def locality_rows_2013():
    """2013: קובץ היישובים הרשמי חסר את המעטפות החיצוניות ⇐ סיכום קובץ הקלפיות לפי סמל יישוב (pipeline/ballots.py)."""
    import ballots
    return [{'code': g['code'], 'name': g['name'], 'external': g['external'], 'eligible': g['eligible'], 'voted': g['voted'],
             'valid': g['valid'], 'invalid': g['invalid'], 'votes': g['votes']} for g in ballots.summarize(ballots.read(19), 'code')]


def build_localities(results, sha256):
    elections = []
    for e in results:
        n = e['knesset']
        rows = locality_rows_2013() if n == 19 else locality_rows(n)
        for row in rows:
            assert sum(row['votes'].values()) == row['valid'], (n, row['code'], 'valid')
            assert row['voted'] == row['valid'] + row['invalid'], (n, row['code'], 'voted')
        for k in ('voted', 'valid', 'invalid'):
            assert sum(r[k] for r in rows) == e[k], (n, k)
        for l in e['lists']:
            assert sum(r['votes'].get(l['letters'], 0) for r in rows) == l['votes'], (n, l['letters'])
        assert len({r['code'] for r in rows}) == len(rows), (n, 'duplicate locality')
        elections.append({'id': e['id'], 'label': e['label'], 'date': e['date'],
                          'source': e['source']['url'] if n in (19, 20) else f'https://media{n}.bechirot.gov.il/files/expc.csv',
                          'sha256': sha256(RAW / 'cec' / ('k19_expb.csv' if n == 19 else f'k{n}_expc.csv')),
                          'eligibleInLocalityFile': sum(r['eligible'] for r in rows),
                          'eligibleNational': e['eligible'],
                          'lists': [{'letters': l['letters'], 'name': l['short']} for l in e['lists']],
                          'rows': sorted(rows, key=lambda r: (r['external'], r['name']))})
    return {'elections': elections}

# שמות המכונים בעברית (סדרת המכון ב-raw/forecast/polls.json ⇐ שם); סדרה לא מזוהה ⇐ לפי שם המכון ברשומת האימות
HIST_FIRM_NAMES = {'panels_politics': 'פאנלס פוליטיקס', 'kantar': 'טלסקר (קנטר)', 'smith': 'סמית׳',
                   'midgam': 'מדגם מחקר וייעוץ', 'dialog': 'דיאלוג', 'geocartography': 'גאוקרטוגרפיה',
                   'maagar_mochot': 'מאגר מוחות', 'tri': 'טרי', 'midgam_project': 'פרויקט מדגם', 'new_wave': 'הגל החדש',
                   'dahaf': 'דחף', '202_strategies': '202 סטרטג׳יז'}
UNKNOWN_FIRMS = [('sarid', 'sarid', 'מכון שריד'), ('shvakim', 'shvakim_panorama', 'שווקים פנורמה')]
# גוף מזמין: מחרוזת בשם האנגלי ברשומת האימות ⇐ שם בעברית. 2015 — ההתאמה הראשונה ברשימה (כמו קודם);
# 2013 — ההופעה המוקדמת ביותר בשם (שמות כמו "Globes / Jerusalem Post": הגוף הראשון שצוין)
PUBLISHERS = {
    20: [('army radio', 'גלי צה״ל'), ('bizportal', 'ביזפורטל'), ('channel 10', 'חדשות 10'),
         ('nana 10', 'נענע 10 / חדשות 10'), ('channel 1', 'ערוץ 1'), ('channel 2', 'חדשות 2'),
         ('globes', 'גלובס'), ('haaretz', 'הארץ'), ('maariv', 'מעריב / ג׳רוזלם פוסט'),
         ('knesset channel', 'ערוץ הכנסת'), ('kol barama', 'קול ברמה'), ('makor rishon', 'מקור ראשון / אנרג׳י'),
         ('reshet bet', 'רשת ב׳'), ('times of israel', 'טיימס אוף ישראל'), ('walla', 'וואלה'),
         ('yedioth', 'ידיעות אחרונות / וויינט'), ('yisrael hayom', 'ישראל היום'), ('i24news', 'i24NEWS')],
    19: [('reshet bet', 'רשת ב׳'), ('kol israel', 'רשת ב׳'), ('israel radio', 'רשת ב׳'), ('radio outlet', 'רדיו (לא צוין)'),
         ('channel 10', 'חדשות 10'), ('channel 1', 'ערוץ 1'), ('mako', 'חדשות 2'), ('channel 2', 'חדשות 2'),
         ('knesset channel', 'ערוץ הכנסת'), ('maariv', 'מעריב'), ('haaretz', 'הארץ'), ('yedioth', 'ידיעות אחרונות'),
         ('walla', 'וואלה'), ('israel hayom', 'ישראל היום'), ('yisrael hayom', 'ישראל היום'),
         ('yisrael post', 'ישראל פוסט / סוף השבוע'), ('israel post', 'ישראל פוסט / סוף השבוע'), ('globes', 'גלובס'),
         ('jerusalem post', 'ג׳רוזלם פוסט'), ('jpost', 'ג׳רוזלם פוסט'), ('times of israel', 'טיימס אוף ישראל'),
         ('makor rishon', 'מקור ראשון')],
}
CYCLE_PAGE = {20: 'Opinion polling for the 2015 Israeli legislative election',
              19: 'Opinion polling for the 2013 Israeli legislative election'}


def publisher_he(n, publisher):
    text = (publisher or '').lower()
    hits = [(text.find(key), i, he) for i, (key, he) in enumerate(PUBLISHERS[n]) if key in text]
    if not hits:
        return None
    return (min(hits, key=lambda h: h[1]) if n == 20 else min(hits))[2]


def history_cycle(election, sha256, recommended):
    """מחזור סקרים (2013/2015) מתמלולי הפרסומים ב-raw/forecast/verification — בלי לפרש שוב טבלת ויקי עם תאים מאוחדים.
    recommended: הרשימות שהמליצו לנשיא על נתניהו אחרי הבחירות, ומקור (raw/blocs.json)."""
    n = election['knesset']
    records = {}
    for path in sorted((RAW / 'forecast' / 'verification').glob('k19_k20_*_results.json')):
        records.update({r['id']: r for r in json.loads(path.read_text()) if r['id'].startswith(f'k{n}-')})
    path = RAW / 'forecast' / 'polls.json'
    polls = []
    for p in json.loads(path.read_text()):
        if p['knesset'] != n:
            continue
        r = records[p['id']]
        firm = r.get('firm') or ''
        firm_key, firm_he = p['series'], HIST_FIRM_NAMES.get(p['series'])
        if firm.startswith('202 Strategies'):
            firm_key, firm_he = '202_strategies', HIST_FIRM_NAMES['202_strategies']
        for pat, key, he in UNKNOWN_FIRMS:
            if firm_he is None and pat in firm.lower():
                firm_key, firm_he = key, he
        pub = publisher_he(n, r.get('publisher'))
        if r.get('publisher') and not pub:
            raise ValueError(r['publisher'])
        if n == 19 and not p['values']:
            continue  # 2013: רשומה בלי ערכים (מחוץ לחלון, לא הושלמה) — אין מה להציג
        # התאריך במזהה הוא תאריך הפרסום בטבלת המקור; לא ממציאים יום עבודת שטח.
        published = p['id'][4:14]
        end = r.get('fieldEnd') or published
        if end >= election['date']:
            continue
        total = sum(v.get('s', 0) for v in p['values'].values())
        polls.append({'id': p['id'], 'start': r.get('fieldStart') or end, 'end': end,
                      'dateBasis': 'fieldwork' if r.get('fieldEnd') else 'publication', 'published': published,
                      'firmKey': firm_key, 'firmHe': firm_he or 'מכון לא צוין', 'publisherHe': pub,
                      'values': p['values'], 'seatSum': total, 'consistent': 118 <= total <= 122,
                      'verificationStatus': p['status'],
                      'urls': __import__('re').findall(r'https?://[^\s;()]+', p.get('source') or '')[:3]})
    return {'id': f'k{n}', 'knesset': n, 'date': election['date'], 'label': election['label'],
            'recommendedNetanyahu': recommended['letters'], 'recommendedSource': recommended['source'],
            'polls': sorted(polls, key=lambda p: (p['end'], p['id']), reverse=True),
            'source': {'page': f'{CYCLE_PAGE[n]}; תמלולי הפרסומים ב-raw/forecast/verification',
                       'sha256': sha256(path), 'tableLine': 1}}
