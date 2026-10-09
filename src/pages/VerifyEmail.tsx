import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/ui";
import { verifyEmailOnce, type VerifyState } from "../lib/verifyEmail";
import { Notice } from "./guess/ui";

/**
 * דף אימות המייל באתר עצמו (הכרעת בעלים 9.10.2026: עדיף דף באתר מאשר כתובת חיצונית של Firebase).
 * הקישור שבמייל (אחרי שמגדירים ב-Firebase "Customize action URL" לכתובת האתר) מגיע לכאן; `main.tsx` מוציא את הקוד מהכתובת מיד,
 * והדף שולח אותו לשרת, שמאמת אותו מול Firebase.
 */
export default function VerifyEmail() {
  const [state, setState] = useState<VerifyState>("working");
  useEffect(() => {
    let live = true;
    void verifyEmailOnce().then((s) => live && setState(s));
    return () => { live = false; };
  }, []);
  return (
    <>
      <PageTitle lead="אימות כתובת המייל">אימות מייל</PageTitle>
      {state === "working" && <p role="status">מאמתים…</p>}
      {state === "ok" && <Notice>המייל אומת. אפשר לחזור ל<Link to="/support" className="font-bold underline">אזור האישי</Link>.</Notice>}
      {state === "expired" && <Notice tone="warn">פג תוקף הקישור. אפשר לשלוח מייל אימות חדש מ<Link to="/support" className="font-bold underline">אזור האישי</Link> ← "הפרטים שלי".</Notice>}
      {state === "bad" && <Notice tone="warn">הקישור אינו תקף או כבר נוצל. אם המייל כבר אומת — אין צורך בשום פעולה. אחרת אפשר לשלוח מייל אימות חדש מ<Link to="/support" className="font-bold underline">אזור האישי</Link> ← "הפרטים שלי".</Notice>}
      {state === "error" && <Notice tone="warn">לא הצלחנו להשלים את האימות כרגע. נסו לפתוח את הקישור שוב בעוד כמה דקות.</Notice>}
    </>
  );
}
