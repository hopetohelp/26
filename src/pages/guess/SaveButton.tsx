import { useState } from "react";
import { CROWD_URL } from "../../lib/crowdApi";
import { hasConsent, setConsent } from "../../lib/crowdSession";
import { Btn } from "./ui";
import type { useSession, SaveState } from "./useCrowd";

export interface SaveUnit {
  status: "draft" | "saved" | "dirty";
  state: SaveState;
  error: string | null;
  save: (token: string | null, setToken: (t: string) => void) => Promise<boolean>;
}

/** כפתור "שמור" + הסכמה לפני השמירה הראשונה + שגיאה עם ניסיון חוזר (אותו op_id) */
export default function SaveButton({
  unit,
  session,
  invalid,
  compact = false,
}: {
  unit: SaveUnit;
  session: ReturnType<typeof useSession>;
  invalid: string | null;
  compact?: boolean;
}) {
  const [consent, setC] = useState(hasConsent);
  const [ask, setAsk] = useState(false);
  const busy = unit.state === "saving";
  const go = async () => {
    if (!consent) return setAsk(true);
    await unit.save(session.token, session.setToken);
  };
  return (
    <div className={compact ? "contents" : "space-y-2"}>
      <Btn kind="primary" onClick={go} disabled={!!invalid || busy || !CROWD_URL || unit.status === "saved"}>
        {busy ? "שומר…" : unit.state === "error" ? "לנסות שוב" : unit.status === "saved" ? "נשמר" : "שמור"}
      </Btn>
      {ask && !consent && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <div className="bg-paper-card text-ink w-full md:max-w-lg rounded-t-theme md:rounded-theme p-5 space-y-3">
            <h2 id="consent-title" className="font-display text-3xl leading-none">לפני השמירה הראשונה</h2>
            <ul className="list-disc ps-5 text-sm space-y-1">
              <li>מה שתשמרו נשמר בשרת האתר, בלי שם ובלי מייל, ומזוהה רק בקישור האישי שלכם.</li>
              <li>הגרסה האחרונה שלכם נכנסת לממוצע הגולשים, בלי שום פרט מזהה. הממוצע מתפרסם רק מ-30 משתתפים, ותא שיש בו פחות מ-10 — מוסתר.</li>
              <li>אף אחד אחר לא רואה את ההשערה האישית שלכם. אפשר למחוק הכול בכל רגע ב"הנתונים שלי".</li>
            </ul>
            <label className="flex items-start gap-2 text-sm font-bold">
              <input type="checkbox" className="mt-1 w-5 h-5" checked={consent} onChange={(e) => setC(e.target.checked)} />
              הבנתי, ואני מסכים/ה
            </label>
            <div className="flex gap-2">
              <Btn
                kind="primary"
                disabled={!consent}
                onClick={() => {
                  setConsent(true);
                  setAsk(false);
                  void unit.save(session.token, session.setToken);
                }}
              >
                אישור ושמירה
              </Btn>
              <Btn
                onClick={() => {
                  setC(false);
                  setAsk(false);
                }}
              >
                ביטול
              </Btn>
            </div>
          </div>
        </div>
      )}
      {unit.error && !compact && (
        <p role="alert" className="text-sm text-warn">
          {unit.error}
        </p>
      )}
    </div>
  );
}
