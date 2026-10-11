import { defaultBlocs } from "../pages/guess/model";
import { PartyAvatar } from "./PartyAvatar";

/**
 * תמונות גושי ברירת המחדל (הכרעת בעלים 11.10.2026): הממשלה היוצאת והקואליציה — נתניהו; האופוזיציה — איזנקוט;
 * אחדות — שניהם; מפלגות ערביות — עבאס. מזהה הגוש בהגדרות הלקוח (government, gov, rest, unity, arab) ובשרת (coalition, opposition).
 */
const PEOPLE: Record<string, string[]> = {
  government: ["likud"],
  gov: ["likud"],
  coalition: ["likud"],
  rest: ["yashar"],
  opposition: ["yashar"],
  unity: ["likud", "yashar"],
  arab: ["raam"],
};
const CANON: Record<string, string> = { coalition: "gov", opposition: "rest" };
const key = (lists: string[]) => [...new Set(lists)].sort().join(",");

/** תמונה רק כשהרכב הגוש הוא ברירת המחדל: גוש שהמשתתף שינה אינו מציג תמונה שעלולה להטעות. מקום ריק לא נשמר. */
export function BlocAvatar({ id, lists, size = 28 }: { id: string; lists?: string[]; size?: number }) {
  const people = PEOPLE[id];
  if (!people) return null;
  const base = defaultBlocs().find((b) => b.id === (CANON[id] ?? id));
  if (lists && base && key(lists) !== key(base.lists)) return null;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {people.map((p, i) => (
        <span key={p} className="rounded-full shadow-[0_0_0_2px_rgb(var(--card))]" style={i ? { marginInlineStart: -size * 0.35 } : undefined}>
          <PartyAvatar id={p} size={size} />
        </span>
      ))}
    </span>
  );
}
