const nf = new Intl.NumberFormat("he-IL");
const pf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const df = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
const tf = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
/** שנת הבחירות: תאריך בשנה הזאת נכתב בלי שנה (8/10); תאריך משנה אחרת — עם שנה (30/6/2024), כדי שלא יהיה דו-משמעי (הכרעת בעלים 11.10.2026) */
export const SITE_YEAR = 2026;

export const num = (n: number) => nf.format(Math.round(n));
export const pct = (n: number) => `${pf.format(n)}%`;
export const seatsFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** תאריך אחד בכל האתר: יום/חודש (8/10), בשעון ישראל. שנה רק כשהיא לא שנת הבחירות. */
export const date = (iso: string) => {
  const p = Object.fromEntries(df.formatToParts(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso)).map((x) => [x.type, x.value]));
  return `${Number(p.day)}/${Number(p.month)}${Number(p.year) === SITE_YEAR ? "" : `/${p.year}`}`;
};
/** שעה בשעון ישראל (14:05) */
export const time = (iso: string) => tf.format(new Date(iso));
/** תאריך ושעה: 8/10, 14:05 */
export const dateTime = (iso: string) => `${date(iso)}, ${time(iso)}`;
/** תאריכים כתובים בטקסט חופשי (ציטוט מקור): 9.9.2026 ⇐ 9/9; שנה אחרת נשארת עם שנה */
export const shortDates = (text: string) =>
  text.replace(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g, (_, d: string, m: string, y: string) => `${d}/${m}${Number(y) === SITE_YEAR ? "" : `/${y}`}`);
/**
 * טווח מספרים או תאריכים: הקטן משמאל והגדול מימין, גם בתוך משפט עברי (הכרעת בעלים 9.10.2026, החלטה 6).
 * מקף בין שני מספרים הוא תו ניטרלי בסדר הדו-כיווני, ובלי בידוד "18–27" מצויר "27–18". LRI ‏(U+2066) ו-PDI ‏(U+2069) מבודדים את הטווח.
 */
export const rng = (a: string | number, b: string | number) => `\u2066${a}–${b}\u2069`;
export const dateRange = (a: string, b: string) => (a === b ? date(a) : rng(date(a), date(b)));
/** מספר עם סימן (+3, −2, 0). מינוס אמיתי (U+2212) — להצגה בתוך <bdi dir="ltr"> */
export const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${seatsFmt(Math.abs(n))}`);
