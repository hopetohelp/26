import modelFile from "../data/model.json";
import { POLL_AVERAGE } from "./sources";
import { POINT_WINDOW, bucketLatest, pointTimes, pollsterKey, groupSeatsIn, usablePolls, latestPerPollster, lists2026, listName, passesInAll, passesInNone, toTime } from "./data";
import { buildHome, type HomeModel } from "./home";
import { defaultBlocs } from "../pages/guess/model";

/**
 * הסקר האחרון של כל מכון (14 הימים האחרונים) ונתוני הדירוג, מחושבים פעם אחת: אותו מקור לבית, ל"המצב היום" ול"תרחישים",
 * כדי שלא יהיו שני מספרים לאותה עובדה (החלטה 14, 9.10.2026).
 */
export const LATEST_POLLS = latestPerPollster(POLL_AVERAGE.asOf, 14);

export const HOME = buildHome(modelFile as unknown as HomeModel, {
  govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
  // לוח המושבים בבית: גוש נתניהו, המפלגות הערביות והשאר — מגושי ברירת המחדל (הכרעת בעלים 11.10.2026)
  coalitionIds: defaultBlocs().find((b) => b.id === "gov")!.lists,
  arabIds: defaultBlocs().find((b) => b.id === "arab")!.lists,
  nameOf: listName,
  // סיכון אחוז החסימה — לפי הסקרים האחרונים בלבד (הכרעת בעלים 12.10.2026, הכרעה 4)
  sure: (id) => passesInAll(LATEST_POLLS, id),
  out: (id) => passesInNone(LATEST_POLLS, id),
});

/**
 * נר לכל נקודה במגמת הממשלה היוצאת (הכרעת בעלים 11.10.2026): נקודה כל 3 ימים, ובה סכום מנדטי מפלגות הממשלה היוצאת בכל סקר
 * מהסקר האחרון של כל מכון ב-14 הימים שמסתיימים בה. סקר שסקר לפחות מפלגה אחת מהן נכנס, ומפלגה שלא נסקרה נספרת 0 (`groupSeatsIn`).
 */
const GOV_IDS = lists2026.filter((l) => l.gov37).map((l) => l.id);
const MODEL_GOV = new Map(HOME.series.map((s) => [toTime(s.date), s.v]));
export const GOV_POINTS: { t: number; values: number[]; mean?: number }[] = HOME.series.length
  ? pointTimes(HOME.series[0].date, HOME.series[HOME.series.length - 1].date).map((t) => ({
      t,
      // 🔴 הנקודה בגרף היא ממוצע המודל באותו יום — אותו מספר שבלוח המושבים ובכותרת (מספר אחד לכל עובדה); הנר מראה את טווח הסקרים בחלון
      mean: MODEL_GOV.get(t),
      values: bucketLatest(usablePolls, (p) => p.end, pollsterKey, t, POINT_WINDOW)
        // הכלל האחד: סקר שסקר לפחות מפלגה אחת מהממשלה היוצאת נכנס; מפלגה שלא נסקרה — 0
        .flatMap((p) => { const v = groupSeatsIn(p, GOV_IDS); return v === null ? [] : [v]; }),
    }))
  : [];
