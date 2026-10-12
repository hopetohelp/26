# כניסה לסוכני קוד

`CLAUDE.md` הוא מקור האמת המחייב לכל סוכן בריפו הזה — לקרוא אותו במלואו לפני כל שינוי.

- 🔴 **עברית בלבד** בכל תגובה ב-GitHub ובכל הודעה לבעלים.
- 🔴 **אינך ממזג.** פותחים PR ומחכים; קלוד ממזג לפי `CLAUDE.md`. חריג יחיד: הבעלים עצמו כותב לך בזמן אמת "מזג" ואת מספר ה-PR.
- **בדיקה עצמאית של המנוע:** דוגמאות בדיקה נבנות ישירות מלשון החוק (סעיפים 81–82 לחוק הבחירות לכנסת) ומהתוצאות הרשמיות של ועדת הבחירות — לא מהפונקציות של המימוש.
- לפני כל PR — הבדיקות המקומיות שב-`CLAUDE.md`.

## מפת הריפו והנתונים הפתוחים (לסוכני קוד ולמפתחים)

אותו תוכן כמו `llms.txt` שבשורש האתר (https://hopetohelp.github.io/26/llms.txt), בגרסה למי שעובד בקוד: איפה כל קובץ, איך הוא נבנה ואיך בודקים. 🔴 **מקור אמת אחד:** האינדקס, קובצי הנתונים ו-`llms.txt` נבנים כולם מ-`src/lib/openData.ts`, מאותן פונקציות שהמסכים משתמשים בהן. אין עותק נפרד למפתח, לסשן Claude Code או לשרת ה-MCP — כולם קוראים את אותם קבצים. נתון חדש באתר ⇐ מוסיפים אותו לקטלוג `OPEN_FILES`, והוא מופיע אוטומטית באינדקס, ב-`llms.txt` ובבדיקה.

### איך זה נבנה
1. `pipeline/build_data.py` — מחומר הגלם (`raw/`) אל `src/data/*.json` (סקרים, מודל, תרחישים, תחזית, תוצאות, היסטוריה). רץ בכל פרסום (`.github/workflows/pages.yml`, כל 4 שעות, חוץ משבת).
2. `npm run build` — בונה את האתר ל-`dist/`, ובסופו `scripts/open-data.ts` כותב את `dist/data/*.json`, `dist/data/index.json` ו-`dist/llms.txt`. משתנה הסביבה `MCP_URL` — כתובת שרת ה-MCP (כשיעלה).
3. בפרסום, אחרי העתקת `dashboard.json` משרת ההשתתפות: `scripts/open-data.ts --dashboard` עוטף אותו ב-`about`, ו-`scripts/check-open-data.ts --with-dashboard` מוודא שכל קובץ שבאינדקס קיים ועדכני.

### הקבצים (כתובת קבועה: `https://hopetohelp.github.io/26/<נתיב>`)
בכל קובץ שדה `about`: `updatedAt` (מועד הבנייה; ב-dashboard — מועד הפרסום של השרת), `kind`, `source`, `method` (הקישור לערך במילון המספרים) ו-`screen`.

| נתיב | תוכן | נבנה מ- | ערך במילון |
|---|---|---|---|
| `data/index.json` | האינדקס: כל הקבצים, המסכים, מילון המספרים, הכללים, כתובת ה-MCP | `buildIndex` | — |
| `llms.txt` | אותו אינדקס בטקסט, לסוכנים | `buildLlmsTxt` | — |
| `data/polls.json` | כל סקרי 2026 + סקרי קבוצות אוכלוסייה | `src/lib/data.ts` | `current` |
| `data/average.json` | ממוצע המודל, הסקר האחרון של כל מכון, מגמה, הממשלה היוצאת | `sources.ts` · `homeData.ts` | `means` |
| `data/scenarios.json` | שיעור תרחישים, טווח 80%, עוברות / על הסף / מתחת, בדיקת עבר | `model.json` · `home.ts` · `backtest.json` | `model` |
| `data/forecast.json` | מודל המגמות | `forecast.json` | `forecast` |
| `data/results.json` | תוצאות רשמיות 2019–2022 ובעלי זכות בחירה | `results.json` · `registry.json` | `results` |
| `data/accuracy.json` | דיוק הסקרים בעבר + כל סקרי המערכות הקודמות | `src/lib/history.ts` | `accuracy` |
| `data/changes.json` | מה השתנה מאז 2022 (שיוך הרשימות) | `src/lib/lineage.ts` | `changes` |
| `dashboard.json` | סטטיסטיקות הגולשים (עותק משרת ההשתתפות) | `pages.yml` + `wrapExternal` | `crowd` |
| `data/party-images.json` | תמונות הרשימות והקרדיטים | `src/lib/partyImages.ts` | אודות |
| `data/dictionary.json` | מילון המספרים בטקסט | `src/pages/Method.tsx` | המילון |

### שאר הריפו
- `src/engine/baderOfer.ts` — מנוע המנדטים (חוק הבחירות); `src/engine/pctForSeats.ts` — מנדטים ⇐ אחוזים. משותף לאתר ולשרת ההשתתפות.
- `src/pages/` — המסכים (הרשימה: `src/lib/pages.ts`); `src/pages/Method.tsx` — מילון המספרים (`DICTIONARY`).
- `worker/crowd/` — שרת ההשתתפות (חשבונות, השערות, גושים, הצבעה, קבוצות, סטטיסטיקות); `worker/feedback/` — שרת ההערות והשיחות עם הצוות.
- `PRODUCT.md` · `DESIGN.md` — חובה לקרוא לפני כל שינוי שנראה באתר.

### איך בודקים
```bash
python3 pipeline/build_data.py && python3 pipeline/test_model.py && python3 pipeline/test_forecast.py
npx tsc --noEmit -p tsconfig.json && npm test && npm run build
npx vite-node scripts/check-open-data.ts   # כל קובץ שבאינדקס קיים ב-dist ועדכני
```
`src/lib/openData.test.ts` מוודא שכל קובץ בקטלוג מקשר לערך קיים במילון, ש-`llms.txt` מזכיר את כולם, ושהקובץ הזה מזכיר את כולם.

### כללים לכל מי שמשתמש בנתונים
ניטרליות (בלי עמדה, בלי המלצה ובלי תחזית מי ינצח; בלי צבעי מפלגות), שקיפות (לכל מספר — סוג, תאריך וקישור "איך זה חושב?"), "שיעור תרחישים" ולא "סיכוי", השערות המשתתפים אינן סקר, ואנונימיות המפעיל. הנוסח המלא: `RULES` ב-`src/lib/openData.ts`.
