import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CapsuleMarks, CapsuleMarksV, ProfileCandle, ProfileCandleV } from './marks';
import { capsuleGradient, verticalTagSides } from '../lib/capsule';
import type { LSeg } from '../lib/chartLanguage';
const segs: LSeg[] = [{from:12,to:20,level:1},{from:20,to:40,level:3},{from:40,to:75,level:5},{from:75,to:90,level:3},{from:90,to:110,level:1}];
describe('קפסולה אחת וטווחים מדויקים בכל כיוון', () => {
  it('שני קצוות הטווח נשמרים גם בציר יורד', () => {
    const horizontal = renderToStaticMarkup(createElement(ProfileCandle, { segs, x:v=>v, base:null }));
    expect(horizontal).toContain('data-range-start="12" data-range-end="110"');
    expect(horizontal).toContain('left:12%;width:98%');
    const vertical = renderToStaticMarkup(createElement(ProfileCandleV, { segs, y:v=>120-v, left:'50%' }));
    expect(vertical).toContain('data-range-start="10" data-range-end="108"');
    expect(vertical).toContain('top:10%;height:98%');
    expect(horizontal).toContain('data-candle-style="capsule"');
  });
  it('הקפסולה מתחילה ב-0, מלאה עד הסקר הנמוך ונחלשת לפי חלק הסקרים', () => {
    const fromZero = renderToStaticMarkup(createElement(ProfileCandle, { segs, x:v=>v/2 }));
    expect(fromZero).toContain('left:0%;width:55%');
    const fill = capsuleGradient(segs,v=>v,false,0);
    expect(fill).toContain('linear-gradient(to right');
    expect(fill).toContain(' / 0.88) 0%');
    expect(fill).toContain(' / 0.88) 10.91%');
    expect(fill).toContain(' / 0.14) 100%');
    expect(fill).toContain(' / 0.288) 68.18%');
    expect(capsuleGradient([{from:20,to:21,level:5}],v=>v,false,0)).not.toContain('0.14');
    const v = renderToStaticMarkup(createElement(ProfileCandleV, { segs, y:v=>120-v, left:'50%', base:0 }));
    expect(v).toContain('top:10%;height:110%');
    expect(capsuleGradient(segs,v=>120-v,true)).toContain('to bottom');
    expect(capsuleGradient([],v=>v)).toBe('none');
  });
  it('נתונים שווים וקרובים מקבלים תגים משני צדי הקווים בלי להזיז את הקווים', () => {
    for (const b of [52,52.1,51.9]) {
      const sides=verticalTagSides(52,b);
      expect(sides.primary).not.toBe(sides.secondary);
      const h=renderToStaticMarkup(createElement(CapsuleMarksV,{left:'50%',primary:{value:52,label:'עיקרי'},secondary:{value:b,label:'משני'},y:v=>100-v}));
      expect(h).toContain('top:48%');
      expect(h).toContain(`top:${100-b}%`);
      expect(h).not.toContain('mk-dot');
      expect(h).not.toContain('mk-ring');
      expect(h).toContain('data-kind="primary"');
      expect(h).toContain('data-kind="secondary"');
    }
    const h=renderToStaticMarkup(createElement(CapsuleMarks,{primary:{at:40,value:52,label:'עיקרי'},secondary:{at:40,value:52,label:'משני'}}));
    expect((h.match(/left:40%/g)??[]).length).toBe(2);
  });
});
