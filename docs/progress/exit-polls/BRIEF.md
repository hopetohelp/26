# Brief: Israeli election-night exit polls (מדגמים) — research & record

Goal: for each assigned election, find EVERY exit poll published on election night by every TV channel / outlet
(Kan/Channel 1/Kan 11, Channel 2 / Keshet 12 / Reshet 13 (Channel 10/13), Channel 14, i24, Channel 20, Knesset channel, radio etc.),
the 22:00 first publication AND every later update published that night (e.g. 23:30, 00:30, 01:30, 02:28) as a SEPARATE record.

Source rules (strict, in order):
1. Original publication: the channel's own site (mako.co.il for Ch2/12, 13tv.co.il / 10tv / reshet, kan.org.il, now14.co.il, i24news.tv).
2. Press that cited the channel the same night: ynet, maariv, haaretz, globes, walla, calcalist, timesofisrael, jpost, israelnationalnews, inn (arutz7), bhol, kikar.
3. Wikipedia (he/en) ONLY as an index and cross-check. A value found only in Wikipedia => status "unverified", sourceLevel "aggregator".
- If a site returns 403 / captcha, do NOT circumvent it (no proxy/unblock services). Try another outlet instead. WebFetch and normal curl are fine. web.archive.org is fine if it loads.
- Note: a page updated during the night often shows the LATER numbers, not 22:00 numbers. Check the publish/update times carefully and assign values to the right time. Exit polls of 2022 e.g. had 22:00 numbers and updated ~00:30-01:30 numbers.
- Do not invent. If you can't find a number, do not guess; record what you found and say so in note.

Starting index (from stored English Wikipedia tables; values may be the 22:00 or an updated version — VERIFY): see wiki_index.txt in this folder.
List keys per election: keys.txt in this folder. Use ONLY those ballot-letter keys (for 2026 the English keys from /home/user/26/raw/exit-polls.json).
A list given 0 seats / below threshold: omit it (or {"s":0}). Every value is {"s": seats}.

Output: write a JSON array to /tmp/claude-0/-home-user-26/9331d959-66c2-5d48-aca5-fa0b8c684438/scratchpad/exit/k<N>.json, one record per exit poll per publication time:
{
 "id": "k25-2022-11-01-2200-kan-11",          // k<N>-<date>-<HHMM>-<publisher slug>
 "knesset": 25,
 "firm": "Kantar", "firmHe": "קנטאר",          // polling firm (English + Hebrew) e.g. Midgam/מדגם (מנו גבע), Camil Fuchs/קמיל פוקס, Direct Polls/דיירקט פולס, Smith/סמית, Dialog, Panel Project HaMidgam, Teleseker/טלסקר
 "publisher": "Kan 11", "publisherHe": "כאן 11",
 "publishedAt": "2022-11-01T22:00:00+02:00",   // ISO with Israel offset (+02:00 winter, +03:00 summer: Apr/Sep 2019 are +03:00)
 "values": {"מחל": {"s": 30}, ...},
 "urls": ["https://..."],                       // at least one; the best/original first
 "status": "match" | "corrected" | "partial" | "unverified",
 "sourceLevel": "primary" | "press" | "aggregator",
 "note": "Hebrew, short: what source confirms which numbers, and the time basis; if wiki differs, say so with old/new values"
}
status: match = numbers confirmed in primary/press source; corrected = wiki index was wrong, fixed to the source (note must state previous value, new value, source);
partial = seats don't sum to 120 or some lists missing in the source; unverified = only aggregator.
Seat sum must be 120 unless status partial.

Work efficiently: use WebSearch (Hebrew queries like "מדגם ערוץ 12 בחירות 2022 22:00", "תוצאות המדגמים" + date) and WebFetch. Save the file progressively.
Final answer: a short summary (records per election, how many match/unverified, notable gaps). Do NOT edit the repo.
