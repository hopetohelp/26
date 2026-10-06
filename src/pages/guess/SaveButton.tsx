import { useEffect, useRef, useState } from "react";
import { CROWD_URL } from "../../lib/crowdApi";
import { AuthForm } from "./Account";
import { Btn } from "./ui";
import type { useSession, SaveState } from "./useCrowd";

export interface SaveUnit {
  status: "draft" | "saved" | "dirty";
  state: SaveState;
  error: string | null;
  save: (token: string) => Promise<boolean>;
}

/**
 * כפתור "שמור". שמירה דורשת חשבון (הכרעת בעלים 6.10.2026): בלי סשן נפתח גיליון הרשמה/כניסה (כולל ההסכמה),
 * ומיד אחריו השמירה עצמה. שגיאה ⇐ ניסיון חוזר עם אותו op_id.
 */
export default function SaveButton({
  unit,
  session,
  invalid,
  compact = false,
  onSaved,
}: {
  unit: SaveUnit;
  session: ReturnType<typeof useSession>;
  invalid: string | null;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [ask, setAsk] = useState(false);
  const busy = unit.state === "saving";
  const run = async (token: string) => {
    if (await unit.save(token)) onSaved?.();
  };
  const go = () => (session.token ? void run(session.token) : setAsk(true));
  return (
    <div className={compact ? "contents" : "space-y-2"}>
      <Btn kind="primary" onClick={go} disabled={!!invalid || busy || !CROWD_URL || unit.status === "saved"}>
        {busy ? "שומר…" : unit.state === "error" ? "לנסות שוב" : unit.status === "saved" ? "נשמר" : "שמור"}
      </Btn>
      {ask && (
        <AuthSheet
          session={session}
          onClose={() => setAsk(false)}
          onDone={(token) => {
            setAsk(false);
            void run(token);
          }}
        />
      )}
      {unit.error && !compact && (
        <p role="alert" className="text-sm text-warn">
          {unit.error}
        </p>
      )}
    </div>
  );
}

/** גיליון הרשמה/כניסה לפני שמירה: בטלפון מלמטה, במחשב במרכז. Esc סוגר; המיקוד נכנס לגיליון וחוזר לכפתור. */
export function AuthSheet({ session, onClose, onDone }: { session: ReturnType<typeof useSession>; onClose: () => void; onDone: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="bg-paper-card text-ink w-full md:max-w-lg rounded-t-theme md:rounded-theme p-5 space-y-3 max-h-[92vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="auth-title" className="font-display text-3xl leading-none">
            כדי לשמור — שם משתמש וסיסמה
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 -mt-2 -me-2 rounded-full text-2xl leading-none text-ink-soft hover:text-ink">
            ×
          </button>
        </div>
        <p className="text-sm text-ink-soft">ההשערה שלכם מחכה כטיוטה. נרשמים פעם אחת, ואז אפשר לחזור אליה ולשנות מכל מכשיר.</p>
        <AuthForm session={session} onDone={onDone} submitSuffix=" ושמירה" />
      </div>
    </div>
  );
}
