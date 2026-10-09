import { call, CrowdError } from "./crowdApi";

/**
 * אימות המייל מהקישור שבמייל (הכרעת בעלים 9.10.2026). הקוד נשמר כאן בזיכרון (לא בכתובת, לא באחסון), והבקשה נשלחת פעם אחת
 * גם אם הדף נטען שוב (למשל ב-StrictMode) — כך הקוד החד-פעמי אינו נשרף בניסיון כפול.
 */
export type VerifyState = "working" | "ok" | "expired" | "bad" | "error";

let pending: string | null = null;
let run: Promise<VerifyState> | null = null;

export function setVerifyCode(code: string) {
  pending = code;
  run = null;
}

export function verifyEmailOnce(): Promise<VerifyState> {
  if (run) return run;
  const code = pending;
  pending = null;
  run = code
    ? call<{ verified: boolean }>("/auth/verify-email", { body: { oobCode: code } }).then(
        (): VerifyState => "ok",
        (e): VerifyState => (e instanceof CrowdError && e.code === "expired_code" ? "expired" : e instanceof CrowdError && e.code === "bad_code" ? "bad" : "error"),
      )
    : Promise.resolve<VerifyState>("bad");
  return run;
}
