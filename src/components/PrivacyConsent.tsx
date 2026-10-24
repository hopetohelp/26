import { useState } from "react";
import { PRIVACY_AGREE, PRIVACY_POINTS, PRIVACY_TITLE, PRIVACY_VERSION, recordPrivacy } from "../lib/privacy";
import { useSession } from "../pages/guess/useCrowd";
import { Btn } from "../pages/guess/ui";

/** נוסח הפרטיות עם תיבת הסימון — בטופס ההרשמה והכניסה ובכרטיס האישור */
export function PrivacyBox({ agree, onAgree }: { agree: boolean; onAgree: (on: boolean) => void }) {
  return (
    <div className="rounded-theme border border-paper-line bg-paper p-3 space-y-2">
      <p className="font-bold text-sm">{PRIVACY_TITLE}</p>
      <ul className="list-disc ps-5 space-y-1 text-sm">{PRIVACY_POINTS.map((x) => <li key={x}>{x}</li>)}</ul>
      <label className="flex items-center gap-2 text-sm font-bold min-h-[44px]">
        <input type="checkbox" className="w-5 h-5 shrink-0" checked={agree} onChange={(e) => onAgree(e.target.checked)} />
        {PRIVACY_AGREE}
      </label>
    </div>
  );
}

/**
 * כרטיס חובה למשתמש מחובר שעוד לא אישר את הגרסה הנוכחית של נוסח הפרטיות (הכרעת בעלים 24.10.2026).
 * מוצג עד האישור; לא מוצג כשהשרת עוד לא מחזיר את השדה, וגם לא כשכרטיס האימות של חשבון ישן פתוח.
 */
export default function PrivacyCard() {
  const session = useSession();
  const me = session.me;
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!session.token || !me || me.privacy === undefined || (me.privacy ?? 0) >= PRIVACY_VERSION) return null;
  if (me.legacy && !me.verified) return null;
  const accept = async () => {
    setBusy(true); setFailed(false);
    try { await recordPrivacy(session.token!); await session.refresh(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return (
    <section className="fixed z-50 bottom-28 inset-x-3 md:bottom-6 md:inset-x-auto md:start-6 md:w-[30rem] max-h-[calc(100dvh-9rem)] overflow-y-auto shadow-2xl rounded-theme" aria-labelledby="privacy-title">
      <div className="border-2 border-ink rounded-theme p-4 bg-paper-card space-y-3">
        <h2 id="privacy-title" className="text-2xl font-display leading-tight">אישור פרטיות</h2>
        <PrivacyBox agree={agree} onAgree={setAgree} />
        <Btn kind="primary" onClick={() => void accept()} disabled={!agree || busy}>אישור</Btn>
        {failed && <p className="text-sm text-warn" role="alert">האישור לא נשמר בגלל תקלה בחיבור. אפשר לנסות שוב.</p>}
      </div>
    </section>
  );
}
