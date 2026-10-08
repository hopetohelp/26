import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InquirySections } from './Admin';
it('משלב פניות רשומות ורגילות באותה קטגוריה בלי לשנות את מסלול התשובה', () => {
  const reply = vi.fn(() => async () => true);
  const html = renderToStaticMarkup(createElement(InquirySections,{reply,data:{days:[],totalVisitors:0,feedback:[{id:7,items:[{author:'visitor',text:'הצעה רגילה',topic:'idea',created_at:'2026-10-08T10:00:00Z'}],updated_at:'2026-10-08T10:00:00Z',waiting:true}],support:{stats:{},threads:[{participant:'p1',status:'new',updated_at:'2026-10-08T11:00:00Z',messages:[{author:'visitor',text:'[רעיון] הצעה רשומה',created_at:'2026-10-08T11:00:00Z'}]}]}}}));
  expect(html).toContain('רעיון (2)');
  expect(html.indexOf('הצעה רשומה')).toBeLessThan(html.indexOf('הצעה רגילה'));
  expect(reply).toHaveBeenCalledWith('feedback',7);
  expect(reply).toHaveBeenCalledWith('support','p1');
  expect(html).not.toContain('שיחות תמיכה של משתמשים רשומים');
});
