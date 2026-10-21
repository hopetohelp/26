import type { LSeg } from './chartLanguage';

/** מילוי לפי האחוזונים שכבר חושבו: הזנבות שקופים, הכתפיים בהירות והליבה מלאה.
 * המעבר הרך תחום לכל קטע; אין חלוקה שרירותית של אורך הנר לחמישיות. */
export function capsuleGradient(segs: LSeg[], map: (v: number) => number, vertical = false): string {
  const ordered = segs.map(s => ({ a: Math.min(map(s.from), map(s.to)), b: Math.max(map(s.from), map(s.to)), opacity: s.level === 5 ? .88 : s.level === 3 ? .32 : 0 })).sort((a, b) => a.a - b.a);
  if (!ordered.length) return 'none';
  const lo = ordered[0].a, hi = ordered[ordered.length - 1].b, span = hi - lo;
  if (!(span > 0)) return 'none';
  const stops = ordered.flatMap((s, i) => {
    const a = (s.a - lo) / span * 100, b = (s.b - lo) / span * 100;
    const soft = Math.min((b - a) * .18, 2.5);
    return [`rgb(var(--mk-range) / ${s.opacity}) ${i === 0 ? 0 : a + soft}%`, `rgb(var(--mk-range) / ${s.opacity}) ${i === ordered.length - 1 ? 100 : b - soft}%`];
  });
  return `linear-gradient(to ${vertical ? 'bottom' : 'right'}, ${stops.join(', ')})`;
}
/** התג העליון והתחתון אינם מזיזים את קווי הנתונים, גם בשוויון מדויק. */
export function verticalTagSides(primary: number, secondary?: number): { primary: 'above' | 'below'; secondary: 'above' | 'below' } {
  return secondary !== undefined && secondary > primary ? { primary: 'below', secondary: 'above' } : { primary: 'above', secondary: 'below' };
}
