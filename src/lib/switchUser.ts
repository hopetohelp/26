import { call } from "./crowdApi";
import { clearAll, getToken, hasPending } from "./crowdSession";
import { forgetDeviceKey } from "./privateChat";

/**
 * החלפת משתמש (הכרעת בעלים 24.10.2026, משפחות על מכשיר אחד): ניתוק המכשיר הזה בלבד, מחיקת כל מה שנשמר בדפדפן
 * למשתמש הקודם (טיוטות, תמונה, מפתח AI שבמכשיר) ומעבר למסך הכניסה. בכניסה עם Google תוצג בחירת חשבון.
 * שמירה שעוד לא הגיעה לשרת ⇐ אישור לפני מחיקה. מחזיר false אם בוטל.
 */
export async function switchUser(confirmLoss: (msg: string) => boolean = (m) => window.confirm(m)): Promise<boolean> {
  if (hasPending() && !confirmLoss("יש שמירה שעוד לא הגיעה לשרת, והיא תימחק מהמכשיר הזה. להחליף משתמש בכל זאת?")) return false;
  const token = getToken();
  if (token) await call("/auth/logout", { token, body: {} }).catch(() => {});
  clearAll();
  forgetDeviceKey();
  try { (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google?.accounts?.id?.disableAutoSelect?.(); } catch { /* Google לא נטען */ }
  window.location.hash = "#/account";
  window.location.reload();
  return true;
}
