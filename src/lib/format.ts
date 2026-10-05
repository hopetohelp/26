const nf = new Intl.NumberFormat("he-IL");
const pf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const df = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
const dlf = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });

export const num = (n: number) => nf.format(Math.round(n));
export const pct = (n: number) => `${pf.format(n)}%`;
export const seatsFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const date = (iso: string) => df.format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
export const dateLong = (iso: string) => dlf.format(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso));
export const dateRange = (a: string, b: string) => (a === b ? date(a) : `${date(a)}–${date(b)}`);
/** מספר עם סימן (+3, −2, 0). מינוס אמיתי (U+2212) — להצגה בתוך <bdi dir="ltr"> */
export const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${seatsFmt(Math.abs(n))}`);
