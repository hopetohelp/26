import { useState } from "react";
import { SITE_URL } from "../lib/shareGuess";

/**
 * כפתור "שיתוף" בסרגל במסכים שאין להם שיתוף משלהם (הכרעת בעלים 02.11.2026):
 * ניסוח וקישור לכל האתר — בחלק הבחירות על הבחירות, ובאזור הניחושים על הניחושים.
 * Web Share כשיש; אחרת — העתקה ללוח, והכפתור אומר "הועתק".
 */
export const SITE_SHARE = {
  elections: { text: "בחירות 2026: התוצאות, מה השתנה מהבחירות הקודמות, והסקרים מול התוצאות. ניתוח עצמאי, בלי המלצות.", path: "#/results" },
  guesses: { text: "ניחושים וסקרים של הגולשים לבחירות 2026. בואו להשתתף ולהשוות.", path: "#/surveys" },
} as const;

export function siteShareMessage(part: keyof typeof SITE_SHARE): { text: string; url: string } {
  return { text: SITE_SHARE[part].text, url: `${SITE_URL}${SITE_SHARE[part].path}` };
}

export default function SiteShareButton({ part }: { part: keyof typeof SITE_SHARE }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const { text, url } = siteShareMessage(part);
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* המשתמש ביטל, או שאין גישה ללוח — אין מה לעשות */ }
  };
  return <button type="button" className="f-share" onClick={() => void share()} aria-live="polite">{copied ? "הועתק" : "שיתוף"}</button>;
}
