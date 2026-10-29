# מיקומי קלפיות 2026

`ballot-locations-2026.xlsx` הוא העתק בתים של רשימת הקלפיות של ועדת הבחירות המרכזית (12,018 קלפיות), שנשמרה בפרויקט קולות נודדים:
https://github.com/harelc/elections-vote-transfer/blob/d01bfca3ca8b52dbf812de9e2236cf81317bb594/data/k26_cec/stations.xlsx

הקובץ התקבל ב־29/10/2026. האתר הממשלתי מפנה לקבצים ב־https://www.gov.il/he/pages/cec-headquarter?chapterIndex=7 ; הורדתו הישירה חסומה בסביבת העבודה. הוצלב מול קובץ התוצאות של 2026: כל קלפי רגילה נמצאה לפי סמל יישוב ומספר תת קלפי, ומספר בעלי הזכות זהה. לא נעשה שימוש בקובץ `ballot_locations_26.json` של המקור, שהוא העתק של מיקומי 2022.

`pipeline/ballot_locations.py` מפענח את קובץ ה־XLSX המקורי בספרייה התקנית של פייתון, וכותב `public/ballot-locations.json`. אין שימוש במיקומי 2026 כדי לקבוע כתובת היסטורית. מספר מרכז קלפיות אינו כתובת; כשאין מיקום 2026 לאותו מספר, מוצג מספר המרכז של 2022 עם השנה.
039f96569b6bd292c28225bc4039c783fe6a980df33206ca3a6a820579968c1a  raw/ballot-locations-2026.xlsx

כתובות 2022 שמורות ב־`raw/ballot-addresses-2022.json`, צילום של קובץ ועדת הבחירות `kalpiplaces_kalpieslist_27-10.xlsx`, כפי שפוענח ונשמר במאגר:
https://github.com/YardenMorad2003/election-dashboard/blob/ac9969e1b4dbe28bd162382d4a41313650dfed3c/analysis/statarea_inputs/k25_ballot_addresses.json

דרך הפענוח המקורית: `analysis/make_k25_ballot_addresses.py` באותו מאגר. הכתובת ההיסטורית משמשת רק כאשר לא נמצא מיקום 2026 למספר הקלפי השלם, ומסומנת 2022.
