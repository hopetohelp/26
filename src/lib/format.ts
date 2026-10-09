const nf = new Intl.NumberFormat("he-IL");
const pf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const df = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
const dlf = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });

export const num = (n: number) => nf.format(Math.round(n));
export const pct = (n: number) => `${pf.format(n)}%`;
export const seatsFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const date = (iso: string) => df.format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
export const dateLong = (iso: string) => dlf.format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
/**
 * טווח מספרים או תאריכים: הקטן משמאל והגדול מימין, גם בתוך משפט עברי (הכרעת בעלים 9.10.2026, החלטה 6).
 * מקף בין שני מספרים הוא תו ניטרלי בסדר הדו-כיווני, ובלי בידוד "18–27" מצויר "27–18". LRI ‏(U+2066) ו-PDI ‏(U+2069) מבודדים את הטווח.
 */
export const rng = (a: string | number, b: string | number) => `\u2066${a}–${b}\u2069`;
export const dateRange = (a: string, b: string) => (a === b ? date(a) : rng(date(a), date(b)));
/** מספר עם סימן (+3, −2, 0). מינוס אמיתי (U+2212) — להצגה בתוך <bdi dir="ltr"> */
export const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${seatsFmt(Math.abs(n))}`);
