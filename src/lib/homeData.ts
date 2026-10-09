import modelFile from "../data/model.json";
import { lastPollDate, latestPerPollster, lists2026, listName, passesInAll, seatsIn, usablePolls } from "./data";
import { buildHome, type HomeModel } from "./home";

/**
 * הסקר האחרון של כל מכון (14 הימים האחרונים) ונתוני הדירוג, מחושבים פעם אחת: אותו מקור לבית, ל"המצב היום" ול"תרחישים",
 * כדי שלא יהיו שני מספרים לאותה עובדה (החלטה 14, 9.10.2026).
 */
export const LATEST_POLLS = latestPerPollster(lastPollDate(), 14);

const MODEL = modelFile as unknown as HomeModel;

/** כמה סקרים מאז תחילת המודל שאלו על הרשימה: עובי הנר בדירוג (ביחס לרשימה שנשאלה הכי הרבה) */
const askedCount = (id: string) => usablePolls.filter((p) => p.end >= MODEL.start && typeof seatsIn(p, id) === "number").length;

export const HOME = buildHome(MODEL, {
  govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
  nameOf: listName,
  sure: (id) => passesInAll(LATEST_POLLS, id),
  volume: askedCount,
});
