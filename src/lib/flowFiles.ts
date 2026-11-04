import { K26_ID } from "./election";

/**
 * קובצי מעבר המצביעים לפי מערכת: 2026 — src/data/flow2026.json (pipeline/voter_flow.py); הקודמות — src/data/flows/kNN.json
 * (pipeline/voter_flows.py, אותו מבנה), NN = הכנסת החדשה. נטענים לפי דרישה, כדי שמסכים אחרים לא יישאו אותם.
 */
const FILES = import.meta.glob("../data/flows/k*.json", { import: "default" });
const idOf = (path: string) => path.match(/(k\d+)\.json$/)![1];
export const HISTORY_FLOW_IDS = Object.keys(FILES).map(idOf);
/** למערכת יש מעבר מצביעים מוכן להצגה */
export const hasFlowFile = (id: string) => id === K26_ID || HISTORY_FLOW_IDS.includes(id);
export const loadHistoryFlow = (id: string): Promise<unknown> | null => FILES[`../data/flows/${id}.json`]?.() ?? null;
