import modelFile from "../data/model.json";
import { lastPollDate, latestPerPollster, lists2026, listName, passesInAll } from "./data";
import { buildHome, type HomeModel } from "./home";

/**
 * הסקר האחרון של כל מכון (14 הימים האחרונים) ונתוני הדירוג, מחושבים פעם אחת: אותו מקור לבית, ל"המצב היום" ול"תרחישים",
 * כדי שלא יהיו שני מספרים לאותה עובדה (החלטה 14, 9.10.2026).
 */
export const LATEST_POLLS = latestPerPollster(lastPollDate(), 14);

export const HOME = buildHome(modelFile as unknown as HomeModel, {
  govIds: lists2026.filter((l) => l.gov37).map((l) => l.id),
  nameOf: listName,
  sure: (id) => passesInAll(LATEST_POLLS, id),
});
