import modelFile from "../data/model.json";
import { POLL_AVERAGE } from "./sources";
import { bucketLatest, pointTimes, pollsterKey, seatsIn, usablePolls, latestPerPollster, lists2026, listName, passesInAll } from "./data";
import { buildHome, type HomeModel } from "./home";

/**
 * הסקר האחרון של כל מכון (14 הימים האחרונים) ונתוני הדירוג, מחושבים פעם אחת: אותו מקור לבית, ל"המצב היום" ול"תרחישים",
 * כדי שלא יהיו שני מספרים לאותה עובדה (החלטה 14, 9.10.2026).
 */
export const LATEST_POLLS = latestPerPollster(POLL_AVERAGE.asOf, 14);

export const HOME = buildHome(modelFile as unknown as HomeModel, {
  govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
  nameOf: listName,
  sure: (id) => passesInAll(LATEST_POLLS, id),
});

/**
 * נר לכל נקודה במגמת הממשלה היוצאת (הכרעת בעלים 11.10.2026): נקודה כל 3 ימים, ובה סכום מנדטי מפלגות הממשלה היוצאת בכל סקר
 * של 3 הימים שמסתיימים בה (הסקר האחרון של כל מכון). סקר שחסרה בו אחת המפלגות שעוברות את הסף בממוצע — לא נספר.
 */
const GOV_IDS = lists2026.filter((l) => l.gov37).map((l) => l.id);
export const GOV_POINTS: { t: number; values: number[] }[] = HOME.series.length
  ? pointTimes(HOME.series[0].date, HOME.series[HOME.series.length - 1].date).map((t) => ({
      t,
      values: bucketLatest(usablePolls, (p) => p.end, pollsterKey, t)
        // רשימה שבממוצע מתחת לסף (למשל נעם) ולא נשאלה בסקר — 0; רשימה גדולה שחסרה — הסקר לא נספר
        .map((p) => GOV_IDS.map((id) => seatsIn(p, id) ?? (POLL_AVERAGE.seats[id] ? undefined : 0)))
        .filter((xs): xs is number[] => xs.every((x) => typeof x === "number"))
        .map((xs) => xs.reduce((a, b) => a + b, 0)),
    }))
  : [];
