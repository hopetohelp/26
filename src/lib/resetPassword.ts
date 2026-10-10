/**
 * איפוס סיסמה (הכרעת בעלים 10.10.2026): הסוד החד-פעמי מהקישור שבמייל נשמר כאן בזיכרון בלבד (לא בכתובת, לא באחסון),
 * עד שהסיסמה החדשה נקבעת. `main.tsx` מוציא אותו מהכתובת מיד.
 */
let secret: string | null = null;

export const SECRET_RE = /^[\w-]{20,100}$/;

export function setResetSecret(s: string) {
  secret = SECRET_RE.test(s) ? s : null;
}
export const getResetSecret = () => secret;
export const clearResetSecret = () => { secret = null; };
