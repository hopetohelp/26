import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InquirySections } from './Admin';
const thread = (id: number, text: string, at: string, waiting = true, topic = 'other') => ({ id, items: [{ author: 'visitor' as const, text, topic, created_at: at }], updated_at: at, waiting });
const data = (feedback: ReturnType<typeof thread>[], support: { participant: string; status: string; updated_at: string; messages: { author: 'visitor' | 'team'; text: string; created_at: string }[] }[] = []) =>
  ({ days: [], totalVisitors: 0, feedback, support: { stats: {}, threads: support } });
const render = (d: ReturnType<typeof data>, reply = vi.fn(() => async () => true)) => ({ html: renderToStaticMarkup(createElement(InquirySections, { reply, data: d })), reply });

it('משלב פניות רשומות ורגילות ברשימה אחת לפי סדר קבלתן (הראשונה שהתקבלה למעלה), בלי לשנות את מסלול התשובה', () => {
  const { html, reply } = render(data(
    [thread(7, 'הצעה רגילה', '2026-10-08T10:00:00Z', true, 'idea')],
    [{ participant: 'p1', status: 'new', updated_at: '2026-10-08T11:00:00Z', messages: [{ author: 'visitor', text: '[רעיון] הצעה רשומה', created_at: '2026-10-08T11:00:00Z' }] }],
  ));
  expect(html).toContain('פניות (2)');
  expect(html.indexOf('הצעה רגילה')).toBeLessThan(html.indexOf('הצעה רשומה'));
  expect(reply).toHaveBeenCalledWith('feedback', 7);
  expect(reply).toHaveBeenCalledWith('support', 'p1');
  expect(html).toContain('התקבלה');
});

it('הסדר לפי ההודעה הראשונה בשיחה, ולא לפי התגובה האחרונה', () => {
  const old = { id: 1, waiting: true, updated_at: '2026-10-09T10:00:00Z', items: [
    { author: 'visitor' as const, text: 'שאלה ישנה', topic: 'other', created_at: '2026-10-01T10:00:00Z' },
    { author: 'visitor' as const, text: 'המשך חדש', topic: 'other', created_at: '2026-10-09T10:00:00Z' },
  ] };
  const { html } = render(data([thread(2, 'שאלה חדשה', '2026-10-05T10:00:00Z'), old]));
  expect(html.indexOf('שאלה ישנה')).toBeLessThan(html.indexOf('שאלה חדשה'));
});

it('מציג סינון לפי נושא עם ספירה, וסינון ממתינות', () => {
  const { html } = render(data([thread(1, 'א', '2026-10-01T10:00:00Z', true, 'data'), thread(2, 'ב', '2026-10-02T10:00:00Z', false, 'idea'), thread(3, 'ג', '2026-10-03T10:00:00Z', true, 'idea')]));
  expect(html).toContain('הכול (3)');
  expect(html).toContain('נתון שגוי (1)');
  expect(html).toContain('רעיון (2)');
  expect(html).toContain('ממתינות לתשובה (2)');
});
