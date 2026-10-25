import type { LSeg } from './chartLanguage';

/** משקל כל רמה לפי האחוזונים של הנר: 10% · 10% · 60% · 10% · 10% */
const LEVEL_SHARE = { 1: .1, 3: .1, 5: .6 } as const;
/** מלא היכן שכל הסקרים מגיעים, ובקצה העליון — עדיין גלוי (סקר אחד לפחות מגיע אליו) */
const FULL = .88, FLOOR = .14;
export const shareOpacity = (share: number) => Math.round((FLOOR + (FULL - FLOOR) * Math.max(0, Math.min(1, share))) * 1000) / 1000;

/** חלק הסקרים שנותנים לפחות את הערך, בגבולות האחוזונים שכבר חושבו (מהנמוך לגבוה).
 * קטע אחד (סקר אחד או ערך אחד) — כולו מלא. */
export function survivalPoints(segs: LSeg[]): { v: number; share: number }[] {
  const ordered = [...segs].sort((a, b) => a.from - b.from);
  if (!ordered.length) return [];
  if (ordered.length === 1) return [{ v: ordered[0].from, share: 1 }, { v: ordered[0].to, share: 1 }];
  const total = ordered.reduce((s, g) => s + LEVEL_SHARE[g.level], 0);
  let cum = 0;
  return [{ v: ordered[0].from, share: 1 }, ...ordered.map(g => ({ v: g.to, share: 1 - (cum += LEVEL_SHARE[g.level]) / total }))];
}

/** קפסולה מ-`base` (בדרך כלל 0) עד הסקר הגבוה: מלאה עד הסקר הנמוך, ומשם נחלשת לפי חלק הסקרים שמגיעים לכל ערך.
 * בלי `base` הקפסולה מתחילה בסקר הנמוך (ציר סטייה). */
export function capsuleGradient(segs: LSeg[], map: (v: number) => number, vertical = false, base?: number): string {
  const pts = survivalPoints(segs);
  if (!pts.length) return 'none';
  if (base !== undefined && base < pts[0].v) pts.unshift({ v: base, share: 1 });
  const ps = pts.map(p => ({ at: map(p.v), o: shareOpacity(p.share) }));
  const lo = Math.min(...ps.map(p => p.at)), hi = Math.max(...ps.map(p => p.at)), span = hi - lo;
  if (!(span > 0)) return 'none';
  const stops = ps.map(p => ({ pct: Math.round((p.at - lo) / span * 10000) / 100, o: p.o })).sort((a, b) => a.pct - b.pct);
  return `linear-gradient(to ${vertical ? 'bottom' : 'right'}, ${stops.map(s => `rgb(var(--mk-range) / ${s.o}) ${s.pct}%`).join(', ')})`;
}
/** התג העליון והתחתון אינם מזיזים את קווי הנתונים, גם בשוויון מדויק. */
export function verticalTagSides(primary: number, secondary?: number): { primary: 'above' | 'below'; secondary: 'above' | 'below' } {
  return secondary !== undefined && secondary > primary ? { primary: 'below', secondary: 'above' } : { primary: 'above', secondary: 'below' };
}
