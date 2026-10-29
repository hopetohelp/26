/**
 * סימון שינוי בכרטיסי "מה השתנה" ובתמונות השיתוף (הכרעת בעלים 29.10.2026):
 * חץ למעלה או למטה במקום פלוס ומינוס, והמספר בלי סימן; כשאין שינוי — לא מוצג כלום.
 */
export interface Change { up: boolean; text: string }

/** קולות ומנדטים: מספר שלם. אחוזים (נקודות אחוז): עשירית האחוז, ושינוי שמתעגל ל-0.0 נחשב "אין שינוי". */
export function changeOf(delta: number, kind: "count" | "pct"): Change | null {
  const abs = Math.abs(delta);
  if (kind === "count") {
    const r = Math.round(abs);
    return r ? { up: delta > 0, text: r.toLocaleString("en-US") } : null;
  }
  const r = Math.round(abs * 10) / 10;
  return r ? { up: delta > 0, text: `${r.toFixed(1)}%` } : null;
}
export const ARROW_UP = "▲", ARROW_DOWN = "▼";
export const changeLabel = (c: Change | null) => (c ? `${c.up ? ARROW_UP : ARROW_DOWN} ${c.text}` : "");

/** שמות ארבעת הפרמטרים (הכרעת בעלים 29.10.2026) — אותם שמות במסך ובתמונות השיתוף */
export const PARAM_NAMES = { votes: "מצביעים", ofEligible: "מזכות בחירה", ofValid: "מהכשרים", seats: "מנדטים" } as const;
