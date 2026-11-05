# סשן ב1 — סקרים 2013–2022: מצב ומסירה

עדכון אחרון: 05.11.2026 (סשן `session_01Q5dg3xV4CvhJh9hNeFXCGN`, ענף `claude/data-polls-past`).
הפרט הרשמי בארבע שורות: `docs/תוכנית-נתונים-מלאים-לכל-המערכות-04-11-2026.md`, "ב1".

## מה מוזג
- **PR 741** — `verificationStatus` + `sourceLevel` לכל סקר בכל מחזור (`attach_verification` ב־`build_history`).
- **PR 748** — סקרים מהבחירות הקודמות ועד הגשת הרשימות (אפר׳ 2019–2022) מהטבלאות הקודמות בדף הוויקיפדיה (`HISTORY[n]["pre"]`): מיפוי זהות, מפלגות־קודמות ב־`unmapped`, `preLists: true`; שיוך מפלגות־קודמות לגושים (`raw/blocs.json` ⇐ `predecessors`, נבדק ב־`check_predecessors`, נקרא ב־`electionBlocs.ts`; הכרעת בעלים 04.11).
- **PR 753** — אימות מול המקור של כל הסקרים שלפני הגשת הרשימות 2019–2022 (`raw/forecast/verification/pre_kNN_queue.json` + `pre_kNN_results_*.json`); תיקון ערך רק ברשומה `corrected`; "הוצלב" (`cross_checked`) כשתואם רק במקור חלופי, "לא אומת" כשנמצא רק בוויקיפדיה (הכרעת בעלים 05.11).
- **PR 763** — אפר׳ 2019 (163/163); שורות תרחיש אינן נקלטות כסקר (אותו יום+מכון+מזמין, או `scenario: true` ברשומה); תמלול מלא מהמקור לסקרים שקריאת הטבלה איבדה בהם תאים (`pre_k21_manual.json`, 4 מ־10).

## PR 764 (2015 ו־2013) — מוזג ונבדק באתר החי
- `pipeline/history_wiki_2015.py`: מנתח לטבלאות 2015/2013 (שנה בשורת כותרת, תאים מאוחדים) ⇐ 2015 +95, 2013 +38, בלי כפילות לסקרים הקיימים; שורת תרחיש מסומנת ברשומה — לא נקלטת.
- אימות כל החדשים מול המקור (`pre_k20_results_1..4`, `pre_k19_results_1..2`).
- `raw/forecast/verification/pre_meta_fixes.json`: תיקון שם מכון/מזמין (ערך קודם, חדש, נימוק, מקור) — 19.
- תצוגה מקדימה תקינה והוסרה; מוזג ונבדק באתר החי (8 מסכים, 390/1280, יום/לילה).

## PR הנוכחי (סשן `session_01Q5dg3y2qQk1RoVjtveMEY1`) — שורות חלקיות ותיקוני שמות
- `pre_k19_manual.json` (21), `pre_k20_manual.json` (6): תמלול מהמקור לשורות שהושמטו; `status: match` + `seats` ⇐ נקלט (11), אחרת תיעוד בלבד. מפתח: (`end`, `firm` = תא הסקר הגולמי בוויקיפדיה).
- `history_wiki_2015.manual_values`: שמות באנגלית ⇐ אותיות (`single` / `joint`), אחר ⇐ `unmapped`; מפלגות חדשות ב־`raw/blocs.json` predecessors (עצמאות, מפלגת דרעי, הירוקים, קדימה/עם שלם ב־2015 — בלי גוש).
- `pre_meta_fixes.json` +11.
- 6 שורות אפר׳ 2019 — המקור עצמו חלקי (נבדק ב־`pre_k21_manual.json`); אין מה להוסיף.

## (ד) — שדרוג למקור ראשי (PR הנוכחי)
- `raw/forecast/verification/primary_upgrades.json` (41): נקרא בסוף `forecast_polls.build()`; רק match/corrected שאינם primary; משנה `sourceLevel`/`source` בלבד (נבדק: שאר השדות זהים; forecast/backtest ללא שינוי).
- 109 לא נמצאו (חסימה/ארכיון שנעלם), 13 "חלשים" (1–5 רשימות במקור) — נשארו "הוצלב".
- שני פערים פתוחים (לא תוקנו — קלט המודל): k23-2020-02-19-panels-politics-maariv (ש"ס 8 ב־maariv article-749466), k20-2015-02-26-w13 (maariv article-465071: מחנה ציוני 25, בית יהודי 11).
- לבדוק בהמשך: k19-2013-01-17-18 (פאנלס, "ערוץ הכנסת") תואם מספר־למספר לסקר mako 17.1.2013 — ייתכן שהמזמין שגוי; k20-2015-03-13-0 — המכון לפי mako: מדגם (בנתונים "לא צוין"); k20-2015-02-24-w18 — לפי JPost יחד לא עוברת (אצלנו 4).

## הצעד הבא (לסשן ההמשך)
1. **(ד) שדרוג "הוצלב" למקור ראשי** (בוצע ל־polls.json: 41/165; נותרו רשומות `pre_*` ברמת press): ~150 רשומות ישנות ב־`raw/forecast/polls.json` (`match` עם `sourceLevel` press/aggregator ⇐ מוצגות "הוצלב") ורשומות `pre_*` ברמת press. לחפש את אתר הגוף המפרסם/דוח לוועדת הבחירות; כשנמצא — לעדכן את רשומת האימות ל־`sourceLevel: primary`. רשומות הקודמות ב־`raw/forecast/verification/k19_k20_*`, `k21_k25_*` נבנות ל־`polls.json` ב־`pipeline/forecast_polls.py` — **שינוי שם עלול לשנות את קלט המודל**: לעדכן רק `sourceLevel` (המודל מסנן לפי `sourceLevels` ב־`pipeline/forecast_k26.json`? לבדוק ש־`test_forecast.py` ו־`backtest.json` לא משתנים).
2. ~~**שורות שקריאתן חלקית**~~ (בוצע ב־PR הנוכחי; 16 שנותרו — המקור עצמו חלקי/לא נמצא) (אזהרות בנייה "הושמט עד תמלול מהמקור"): 2015 — 6, 2013 — 21 (בחלקן הרשימה בוויקיפדיה עצמה חסרה מפלגות — אז אין מה לתקן), אפר׳ 2019 — 6. קליטה דרך `pre_kNN_manual.json` (המנגנון קיים ל־k21 ב־`build_history`; ל־2015/2013 צריך להוסיף ב־`history_wiki_2015.add_polls`).
3. ~~**עוד תיקוני שמות**~~ (בוצע חלקית: 11; מועמדים מפוקפקים — k22-2019-05-30 קאן/דיירקט פולס, k22-2019-07-03 סטטנט, k21-2017-07-27 סטטנט — לא שונו, אין מקור ודאי) מהערות הסוכנים ב־`pre_*_results_*.json` (חיפוש "pollster"/"publisher"/"commissioned").

## שיטה (לסוכני אימות)
- תדריך: `/tmp/claude-0/.../scratchpad/briefs/brief.md` (זמני). העיקר: מקור ראשי ⇐ עיתונות ⇐ (ויקיפדיה/knessetjeremy אינם מקור); לא עוקפים חסימה (403/captcha); web.archive.org לא נגיש מהסביבה; פלט JSON לרשומה: id, status, sourceLevel, source, differences[{key, wikipedia, source}], fieldEndSource, sample, moe, note, scenario.
- הסוכנים כותבים לתיקייה זמנית (לא לריפו), ומעתיקים לריפו רק בסיום — אחרת כל כתיבה מפעילה CI מחדש. אחרי העתקה: `BUILD_TIME=<meta.dataAsOf> python3 pipeline/build_data.py` לפני commit (בדיקת דטרמיניזם ב־CI).
