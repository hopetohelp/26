import type { Dashboard } from "../../lib/crowdApi";
import { IDS, K25_IDS, VOTE_MAP } from "./model";

/** רק זוג תשובות למפלגות ממשיות; תשובות חסרות/פרטיות/מתלבטים אינן שינוי דעה. */
export function voteContinuity(matrix: NonNullable<Dashboard["matrix"]>) {
  let same = 0;
  let changed = 0;
  let split = 0;
  for (const [previous, row] of Object.entries(matrix.rows)) {
    if (row.hidden || !K25_IDS.includes(previous)) continue;
    for (const [next, cell] of Object.entries(row.cells)) {
      if (cell.hidden || !IDS.includes(next)) continue;
      if (previous === "ט" && ["rzp", "otzma", "noam"].includes(next)) split += cell.n;
      else if (VOTE_MAP[next] === previous) same += cell.n;
      else changed += cell.n;
    }
  }
  return { same, changed, split, total: same + changed + split };
}
