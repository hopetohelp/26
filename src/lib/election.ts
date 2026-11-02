import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { electionButtonLabel, results } from "./data";

/**
 * בורר המערכת האחד (docs/תוכנית-לשוניות-ניתוח-אחיד-02-11-2026.md, הכרעות בעלים 02.11.2026):
 * כפתור בפס העליון שקובע את המערכת בכל מסכי הבחירות יחד. הבחירה נשמרת בכתובת (?election=), כדי שקישור ששותף יפתח אותה;
 * בלי פרמטר — 2026. "סיכום" הוא פריט אחרון בבורר.
 */
export type ElectionId = string;
export const K26_ID = "k26";
export const SUMMARY_ID = "summary";

export interface ElectionOption { id: ElectionId; label: string; knesset: number | null; full: string }

const short = (label: string) => electionButtonLabel(label).replace("אפריל", "אפר׳").replace("ספטמבר", "ספט׳");

/** המערכות בבורר, מהחדשה לישנה, ואחריהן "סיכום" */
export const ELECTIONS: ElectionOption[] = [
  { id: K26_ID, label: "2026", knesset: 26, full: "אוקטובר 2026" },
  ...[...results].reverse().map((e) => ({ id: e.id, label: short(e.label), knesset: e.knesset, full: e.label })),
];
export const SUMMARY: ElectionOption = { id: SUMMARY_ID, label: "סיכום", knesset: null, full: "כל המערכות" };
export const PICKER_OPTIONS: ElectionOption[] = [...ELECTIONS, SUMMARY];

/** המסכים שהבורר חל עליהם */
export const ELECTION_SCREENS = ["/results", "/changes", "/polls"];
export const isElectionScreen = (pathname: string) => ELECTION_SCREENS.includes(pathname);

/** מזהה תקין בלבד; כל ערך אחר ⇐ 2026 */
export function parseElection(raw: string | null): ElectionId {
  return raw && PICKER_OPTIONS.some((o) => o.id === raw) ? raw : K26_ID;
}
export const electionOption = (id: ElectionId): ElectionOption => PICKER_OPTIONS.find((o) => o.id === id) ?? ELECTIONS[0];

/** המערכת שקדמה לזו שנבחרה ("מה השתנה" מציג תמיד מול הקודמת); null כשהקודמת אינה בנתוני האתר */
export function previousElection(id: ElectionId): ElectionOption | null {
  const i = ELECTIONS.findIndex((o) => o.id === id);
  return i >= 0 && i < ELECTIONS.length - 1 ? ELECTIONS[i + 1] : null;
}

/** המערכת שנבחרה, ופונקציה להחלפתה (שומרת על המסך ומוחקת לשונית פנימית שאינה קיימת בכל מערכת) */
export function useElection(): [ElectionId, (id: ElectionId) => void] {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const id = parseElection(params.get("election"));
  const set = (next: ElectionId) => {
    const q = new URLSearchParams(params);
    q.delete("view");
    if (next === K26_ID) q.delete("election"); else q.set("election", next);
    const s = q.toString();
    navigate(`${pathname}${s ? `?${s}` : ""}`, { replace: true });
  };
  return [id, set];
}
