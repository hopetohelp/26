/**
 * שם הקישור באנגלית מתוך שם הקבוצה בעברית (הכרעת בעלים 12.10.2026): תעתיק לפי ההגייה, בלי שירות חיצוני — ולכן גם בלי לשלוח את שם הקבוצה החוצה.
 * זה תעתיק ולא תרגום מילוני: "הגזרה" ⇐ hagzara. מי שרוצה שם אחר — משנה בכרטיס הקבוצה.
 * אותיות בעברית בלי ניקוד אינן מציינות תנועות, ולכן ההיוריסטיקה: ה' הידיעה בתחילת מילה ⇐ ha, ה' בסוף ⇐ a, ו ⇐ o, י ⇐ i, א/ע ⇐ a,
 * ושלוש עיצורים רצופים (או שניים בסוף מילה אחרי תנועה) מופרדים ב-a.
 */
const CONSONANT = { ב: "b", ג: "g", ד: "d", ה: "h", ז: "z", ח: "ch", כ: "k", ך: "ch", ט: "t", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", פ: "p", ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t" };
const VOWEL = { א: "a", ע: "a", ו: "o", י: "i" };
const HEBREW = /[א-ת]/;

function hebrewWord(word) {
  const letters = [...word];
  const tokens = []; // { c: true } עיצור או { c: false } תנועה, עם הטקסט הלטיני
  letters.forEach((ch, i) => {
    const first = i === 0, last = i === letters.length - 1;
    if (first && ch === "ה" && letters.length > 2) tokens.push({ c: false, t: "ha" });
    else if (last && ch === "ה" && i > 0) tokens.push({ c: false, t: "a" });
    else if (ch in VOWEL) {
      const prev = tokens[tokens.length - 1];
      if (first && (ch === "ו" || ch === "י")) tokens.push({ c: true, t: ch === "ו" ? "v" : "y" });
      else if (prev && !prev.c && VOWEL[ch] === "a") { /* א/ע אחרי תנועה — שקטות */ }
      else tokens.push({ c: false, t: VOWEL[ch] });
    } else if (ch in CONSONANT) tokens.push({ c: true, t: ch === "ב" && !first ? "v" : CONSONANT[ch] });
  });
  let out = "", run = 0;
  tokens.forEach((tk, i) => {
    if (tk.c) {
      run++;
      const nextIsConsonant = tokens[i + 1]?.c;
      const endOfWord = i === tokens.length - 1;
      // שלושה עיצורים רצופים — תנועה לפני השלישי; שניים בסוף מילה אחרי תנועה — תנועה לפני האחרון
      if ((run === 3) || (endOfWord && run === 2 && i >= 2 && !tokens[i - 2].c)) out += "a";
      out += tk.t;
      if (!nextIsConsonant) run = 0;
    } else { out += tk.t; run = 0; }
  });
  return out;
}

/** שם קבוצה ⇐ שם קישור תקין (a-z, ספרות ומקף; 3–32 תווים), או null אם אין בשם אות או ספרה */
export function slugFromName(name) {
  const words = String(name ?? "").normalize("NFKD").replace(/[֑-ׇ]/g, "").toLowerCase().split(/[^0-9a-zא-ת]+/).filter(Boolean);
  const parts = words.map((w) => (HEBREW.test(w) ? hebrewWord(w.replace(/[^א-ת]/g, "")) : w)).filter(Boolean);
  let slug = parts.join("-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return null;
  if (slug.length > 32) {
    // חותכים בגבול מילה (מקף) אם יש כזה אחרי 8 תווים, אחרת באמצע
    const cut = slug.slice(0, 32), at = cut.lastIndexOf("-");
    slug = (slug[32] === "-" || at < 8 ? cut : cut.slice(0, at)).replace(/-+$/g, "");
  }
  if (slug.length < 3) slug = `${slug}-group`.slice(0, 32);
  return slug;
}

/** שם פנוי: מוסיפים -2, -3… (ומקצרים כדי להישאר עד 32 תווים). taken = (slug) => Promise<boolean> */
export async function freeSlug(base, taken) {
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base.slice(0, 32 - String(n).length - 1).replace(/-+$/g, "")}-${n}`;
  return slug;
}
