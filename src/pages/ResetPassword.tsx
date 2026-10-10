import { Link } from "react-router-dom";
import { PageTitle } from "../components/ui";
import { getResetSecret } from "../lib/resetPassword";
import { ResetPasswordForm } from "./guess/Account";
import { Notice } from "./guess/ui";
import { useSession } from "./guess/useCrowd";

/**
 * דף קביעת סיסמה חדשה (הכרעת בעלים 10.10.2026): הקישור שבמייל האיפוס מוביל לכאן, והסוד נמצא בזיכרון (`main.tsx` הוציא אותו מהכתובת).
 * בלי סוד (רענון הדף, כניסה ישירה) — מפנים לבקשת מייל חדש.
 */
export default function ResetPassword() {
  const session = useSession();
  return (
    <>
      <PageTitle lead="קביעת סיסמה חדשה לחשבון">איפוס סיסמה</PageTitle>
      {getResetSecret() ? (
        <ResetPasswordForm session={session} />
      ) : (
        <Notice tone="warn">
          הקישור לא נטען, או שכבר נעשה בו שימוש. אפשר לבקש מייל חדש: <Link to="/support" className="font-bold underline">אזור אישי</Link> ← כניסה ← "שכחתי סיסמה".
        </Notice>
      )}
    </>
  );
}
