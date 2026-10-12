import { splitLinks } from "../lib/linkify";
import { SITE_URL } from "../lib/shareGuess";

/**
 * טקסט הודעה עם קישורים לחיצים. קישור לאתר עצמו נפתח באותה לשונית (כך שקישור קבוצה פותח את הסקר), וקישור חיצוני בלשונית חדשה.
 * הכול כרכיבי React (בלי HTML גולמי), והכתובת עצמה היא הטקסט שמוצג.
 */
export default function Linkified({ text }: { text: string }) {
  return <>{splitLinks(text).map((p, i) => p.href
    ? <a key={i} href={p.href} {...(p.href.startsWith(SITE_URL) ? {} : { target: "_blank", rel: "noopener noreferrer" })} dir="ltr" className="underline underline-offset-2 font-bold break-all">{p.text}</a>
    : <span key={i}>{p.text}</span>)}</>;
}
