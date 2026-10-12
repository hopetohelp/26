import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import modelFile from "../data/model.json";
import { num } from "../lib/format";

/**
 * אייקון מידע אחיד (הכרעת בעלים 12.10.2026, הכרעה 5 ב-`docs/ביקורת-קודקס-12-10-2026.md`): עיגול קטן עם "i" ליד נתון,
 * ובלחיצה (או Enter/רווח במקלדת) נפתח מתחתיו הסבר קצר, ואם יש — קישור לערך במילון המספרים. Escape, לחיצה מחוץ לחלון
 * או יציאה ממנו במקלדת סוגרים אותו. כפתור אמיתי עם `aria-expanded` ו-`aria-controls`, והחלון נמצא מיד אחריו ב-DOM,
 * כך שקורא מסך מגיע אליו בסדר הטבעי. הכול מהטוקנים (`ink`, `paper`, `signal`), כמו חלון הנקודה בגרפים.
 *
 * רכיב כללי: `children` הוא ההסבר, ו-`methodAnchor` (לא חובה) הקישור. למספרי המודל והתרחישים — `ModelInfo` למטה.
 * 🔴 בלי כפילות (DESIGN.md): במסך שכבר יש בו "איך זה חושב?" אל אותו ערך — `methodAnchor` לא מועבר.
 */
export default function InfoTip({ label, children, methodAnchor, className = "" }: { label: string; children: ReactNode; methodAnchor?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);

  // החלון נשאר בתוך המסך: מוזז לרוחב כך שיהיו לפחות 12px מכל קצה (גם ב-360px)
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const place = () => {
      const p = panel.current;
      if (!p) return;
      // המיקום בלי ההזזה הנוכחית, כדי שהחישוב לא יצטבר
      const r = p.getBoundingClientRect();
      const cur = Number(p.dataset.shift ?? 0);
      const left = r.left - cur;
      const right = r.right - cur;
      const vw = document.documentElement.clientWidth;
      const pad = 12;
      setShift(left < pad ? pad - left : right > vw - pad ? vw - pad - right : 0);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <span
      ref={root}
      className={`relative inline-flex align-middle ${className}`}
      onBlur={(e) => { if (open && !root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className={`relative inline-flex items-center justify-center size-5 rounded-full text-ink-soft hover:text-ink after:absolute after:-inset-3 after:content-[''] ${open ? "text-ink" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v5.5M12 7.5h.01" />
        </svg>
      </button>
      <span
        ref={panel}
        id={id}
        role="note"
        hidden={!open}
        data-shift={shift}
        style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        className="absolute top-full mt-2 start-1/2 -ms-36 z-40 w-72 max-w-[calc(100vw-1.5rem)] rounded-theme bg-ink text-paper p-3 text-start text-sm font-normal leading-snug whitespace-normal tracking-normal shadow-lg"
      >
        <span className="block">{children}</span>
        {methodAnchor && (
          <Link to={`/method#${methodAnchor}`} className="mt-2 inline-flex min-h-[32px] items-center font-semibold text-paper underline underline-offset-2 hover:text-paper">
            איך זה חושב?
          </Link>
        )}
      </span>
    </span>
  );
}

/** כמה תרחישים יש במודל (מ-`model.json`, מתעדכן לבד בכל רענון) */
export const SCENARIO_COUNT: number = (modelFile as unknown as { params: { scenarios: number } }).params.scenarios;

/** סוגי נתוני המודל שמסומנים באתר. כל נוסח — משפט אחד, ותמיד "לא נתון ישיר מהסקרים". */
export type ModelInfoKind = "mean" | "range" | "pass" | "meanRange" | "trend";

export const MODEL_INFO: Record<ModelInfoKind, { label: string; text: () => string }> = {
  mean: { label: "הסבר: ממוצע המודל", text: () => "ממוצע המודל: מחושב במודל מכל הסקרים, אחרי חלוקת המנדטים — לא נתון ישיר מהסקרים." },
  range: { label: "הסבר: טווח 80% מהתרחישים", text: () => `טווח 80% מתוך ${num(SCENARIO_COUNT)} תרחישים של המודל — לא הטווח בין הסקרים.` },
  pass: { label: "הסבר: שיעור התרחישים", text: () => `מחושב במודל, מתוך ${num(SCENARIO_COUNT)} תרחישים — לא נתון ישיר מהסקרים, ולא סיכוי.` },
  meanRange: {
    label: "הסבר: ממוצע המודל וטווח 80% מהתרחישים",
    text: () => `"היום" הוא ממוצע המודל, והנר הוא טווח 80% מתוך ${num(SCENARIO_COUNT)} תרחישים של המודל — מחושבים במודל, לא נתון ישיר מהסקרים.`,
  },
  trend: { label: "הסבר: ממוצע המודל בגרף", text: () => "הקו והנקודות: ממוצע המודל בכל יום — מחושב במודל, לא נתון ישיר מהסקרים. הנרות: הסקרים עצמם." },
};

/**
 * אייקון המידע ליד נתון שחושב במודל או בתרחישים (הכרעת בעלים 12.10.2026): בכל האתר חוץ ממסך התרחישים.
 * `link={false}` — כשבמסך כבר יש "איך זה חושב?" אל ערך המודל (בלי כפילות).
 */
export function ModelInfo({ kind, link = true, className }: { kind: ModelInfoKind; link?: boolean; className?: string }) {
  const m = MODEL_INFO[kind];
  return (
    <InfoTip label={m.label} methodAnchor={link ? "model" : undefined} className={className}>
      {m.text()}
    </InfoTip>
  );
}
