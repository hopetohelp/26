/**
 * ציור תמונות השיתוף של "מה השתנה" (הכרעת בעלים 29.10.2026): 1080×1350 קבוע, מסגרת הגזרה תמיד, ושתי תצוגות — כהה (ברירת מחדל,
 * כמו היום: הילות כחולות ואדומות וכרטיסים רכים) ובהירה (כרטיסי האתר). הכול כרטיסים קומפקטיים: שם פרמטר, נתון ושינוי.
 * הנתונים מגיעים מוכנים מ-`flowShareData.ts`; כאן רק פריסה וציור: כמה שורות נכנסות נקבע לפי המקום שנשאר, ומה שנשאר — רווח.
 */
import { drawQr, ltrText, sharePalette, IMG_H, IMG_W } from "../pages/guess/shareImage";
import { SITE_URL } from "./shareGuess";
import { ARROW_DOWN, ARROW_UP, type Change } from "./changeMark";
import type { CityLine, FlowLine, ParamCardModel, PartyBlock, Scene, TableRow } from "./flowShareData";

export type ShareTheme = "dark" | "light";

interface Look {
  bg: string; card: string; cardLine: string | null; shadow: boolean; ink: string; soft: string; line: string; accent: string; accentSoft: string;
  neg: string; pos: string; bar: string; track: string; tag: string; gapHead: string; glow: boolean;
}
const LOOKS: Record<ShareTheme, Look> = {
  dark: { bg: "#05070d", card: "rgba(255,255,255,.07)", cardLine: null, shadow: false, ink: "#ffffff", soft: "rgba(255,255,255,.64)", line: "rgba(255,255,255,.14)",
    accent: "#7fb0f2", accentSoft: "rgba(255,255,255,.06)", neg: "#ff6b72", pos: "#7fb0f2", bar: "#2f74d8", track: "rgba(255,255,255,.12)", tag: "rgba(255,255,255,.10)", gapHead: "rgba(127,176,242,.22)", glow: true },
  light: { bg: "#EEF3FA", card: "#FFFFFF", cardLine: "#D5DEEC", shadow: true, ink: "#142B50", soft: "#4A5E80", line: "#D5DEEC", accent: "#1762D0", accentSoft: "#E4EEFC",
    neg: "#B3261E", pos: "#1B7A3E", bar: "#1762D0", track: "#D5DEEC", tag: "#E4EEFC", gapHead: "#1762D0", glow: false },
};

const W = IMG_W, H = IMG_H;
const PAD_X = 84, TOP = 58, BOTTOM = 54, CW = W - 2 * PAD_X, R = W - PAD_X, L = PAD_X;
const QR = 96, FOOT = QR;
const GAP = 12;

type Ctx = CanvasRenderingContext2D;
interface Fonts { display: string; body: string; num: string }
interface Pen { ctx: Ctx; look: Look; f: Fonts }

const lineOf = (x: number, y1: number, y2: number, p: Pen) => { p.ctx.save(); p.ctx.strokeStyle = p.look.line; p.ctx.lineWidth = 2; p.ctx.setLineDash([8, 6]); p.ctx.beginPath(); p.ctx.moveTo(x, y1); p.ctx.lineTo(x, y2); p.ctx.stroke(); p.ctx.restore(); };
const hline = (x1: number, x2: number, y: number, p: Pen) => { p.ctx.save(); p.ctx.strokeStyle = p.look.line; p.ctx.lineWidth = 2; p.ctx.setLineDash([8, 6]); p.ctx.beginPath(); p.ctx.moveTo(x1, y); p.ctx.lineTo(x2, y); p.ctx.stroke(); p.ctx.restore(); };

function card(p: Pen, x: number, y: number, w: number, h: number, r = 28) {
  const { ctx, look } = p;
  ctx.save();
  if (look.shadow) { ctx.shadowColor = "rgba(20,43,80,.10)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6; }
  ctx.fillStyle = look.card; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.restore();
  if (look.cardLine) { ctx.save(); ctx.strokeStyle = look.cardLine; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); ctx.restore(); }
}

/** טקסט במרכז שורה בגובה `lh` שראשה ב-`y` */
function text(p: Pen, s: string, x: number, y: number, lh: number, font: string, color: string, align: CanvasTextAlign = "right") {
  const { ctx } = p;
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.direction = "rtl";
  ctx.fillText(s, x, y + lh / 2);
}
const width = (p: Pen, s: string, font: string) => { p.ctx.font = font; return p.ctx.measureText(s).width; };
/** קיצור עם שלוש נקודות, כשהשם ארוך מהמקום */
function fit(p: Pen, s: string, font: string, maxW: number) {
  let t = s;
  while (width(p, t, font) > maxW && t.length > 3) t = `${t.slice(0, -2)}…`;
  return t;
}

/** גודל גופן שהטקסט נכנס בו ברוחב `maxW` (מקטין מ-`size` עד `min`) */
function fitSize(p: Pen, s: string, weight: number, family: string, size: number, maxW: number, min = 24) {
  let z = size;
  while (z > min && width(p, s, `${weight} ${z}px ${family}`) > maxW) z -= 1;
  return z;
}

/** שינוי: חץ ומספר בלי סימן, מיושר לשמאל מ-`x`; מחזיר את הרוחב. אין שינוי — לא מצייר כלום */
function drawChange(p: Pen, c: Change | null, x: number, y: number, lh: number, size: number): number {
  if (!c) return 0;
  const { ctx, look } = p, color = c.up ? look.pos : look.neg;
  const arrow = c.up ? ARROW_UP : ARROW_DOWN, aFont = `700 ${Math.round(size * 0.62)}px ${p.f.display}`, nFont = `700 ${size}px ${p.f.num}`;
  const aw = width(p, arrow, aFont), nw = width(p, ltrText(c.text), nFont);
  ctx.textAlign = "left";
  text(p, arrow, x, y, lh, aFont, color, "left");
  text(p, ltrText(c.text), x + aw + size * 0.25, y, lh, nFont, color, "left");
  return aw + size * 0.25 + nw;
}
const changeWidth = (p: Pen, c: Change | null, size: number) =>
  c ? width(p, c.up ? ARROW_UP : ARROW_DOWN, `700 ${Math.round(size * 0.62)}px ${p.f.display}`) + size * 0.25 + width(p, ltrText(c.text), `700 ${size}px ${p.f.num}`) : 0;

/* ── בלוקים: לכל בלוק גובה לפי מספר השורות, וציור ── */
interface Block { min: number; max: number; height: (n: number) => number; draw: (y: number, n: number) => void }

/** כרטיסי פרמטרים, שניים בשורה; הכרטיס האחרון הבודד תופס שורה שלמה. `m` — מקדם גודל כשיש מקום */
function paramBlock(p: Pen, cards: ParamCardModel[], m = 1): Block {
  const k = (v: number) => Math.round(v * m);
  const h = k(124), gap = 12, w = (CW - gap) / 2, rows = Math.ceil(cards.length / 2);
  return { min: 1, max: 1, height: () => rows * h + (rows - 1) * gap, draw: (y) => {
    cards.forEach((c, i) => {
      const alone = cards.length % 2 === 1 && i === cards.length - 1;
      const cw = alone ? CW : w, x = alone ? L : R - w - (i % 2) * (w + gap), cy = y + Math.floor(i / 2) * (h + gap);
      card(p, x, cy, cw, h);
      const pad = k(18), lab = k(36), vlh = k(50);
      text(p, c.label, x + cw - 24, cy + pad, lab, `600 ${k(30)}px ${p.f.display}`, p.look.soft);
      const avail = cw - 48, gapPx = 14;
      let size = k(46);
      while (size > 36 && width(p, ltrText(c.value), `800 ${size}px ${p.f.num}`) + gapPx + changeWidth(p, c.change, k(32)) > avail) size -= 2;
      text(p, ltrText(c.value), x + cw - 24, cy + pad + lab + 4, vlh, `800 ${size}px ${p.f.num}`, p.look.ink);
      drawChange(p, c.change, x + 24, cy + pad + lab + 4, vlh, k(32));
    });
  } };
}

/** "השינוי הגדול ביותר": הערים לרוחב — מלמעלה למטה: האחוז מבעלי זכות הבחירה (בקטן), השינוי, שם העיר */
function citiesBlock(p: Pen, cities: CityLine[], m = 1): Block {
  const k = (v: number) => Math.round(v * m), title = "השינוי הגדול ביותר", small = "מבעלי זכות הבחירה";
  const head = k(41), l1 = k(29), l2 = k(46), l3 = k(37), h = 16 + head + 10 + l1 + l2 + l3 + k(18);
  return { min: Math.min(1, cities.length), max: cities.length, height: () => h, draw: (y, n) => {
    const list = cities.slice(0, n);
    card(p, L, y, CW, h);
    const tFont = `700 ${k(34)}px ${p.f.display}`, sFont = `500 ${k(24)}px ${p.f.display}`, tw = width(p, title, tFont), sw = width(p, small, sFont);
    const start = L + CW / 2 + (tw + 14 + sw) / 2;
    text(p, title, start, y + 16, head, tFont, p.look.accent);
    text(p, small, start - tw - 14, y + 16 + 8, head - 8, sFont, p.look.soft);
    const colW = (CW - 48) / list.length, top = y + 16 + head + 10;
    list.forEach((c, i) => {
      const cx = L + CW - 24 - colW * (i + 0.5);
      if (i) lineOf(L + CW - 24 - colW * i, top, top + l1 + l2 + l3, p);
      if (c.small) text(p, ltrText(c.small), cx, top, l1, `500 ${k(24)}px ${p.f.num}`, p.look.soft, "center");
      const cw = changeWidth(p, c.change, k(42));
      if (c.change) drawChange(p, c.change, cx - cw / 2, top + l1, l2, k(42));
      text(p, fit(p, c.name, `600 ${k(31)}px ${p.f.display}`, colW - 20), cx, top + l1 + l2, l3, `600 ${k(31)}px ${p.f.display}`, p.look.ink, "center");
    });
  } };
}

/** כרטיס תנועה עם גרף: שם, פס ואחוז; כמה שורות שיש מקום. `m` — מקדם גודל כשיש מקום */
function barsBlock(p: Pen, title: string, lines: FlowLine[], sx = L, w = CW, compact = false, m = 1): Block {
  const k = (v: number) => (compact ? v : Math.round(v * m)), titled = title !== "";
  const rowH = compact ? 36 : k(40), gap = compact ? 6 : k(8), tl = compact ? 34 : k(41), head = titled ? tl + 6 : 0, padB = compact ? 14 : k(18), top = compact ? 16 : k(16);
  const ph = (n: number) => top + head + n * rowH + Math.max(0, n - 1) * gap + padB;
  return { min: Math.min(1, lines.length), max: Math.min(lines.length, 6), height: (n) => ph(n), draw: (y, n) => {
    card(p, sx, y, w, ph(n));
    if (titled) text(p, title, sx + w / 2, y + top, tl, `700 ${compact ? 28 : fitSize(p, title, 700, p.f.display, k(34), w - 40)}px ${p.f.display}`, p.look.accent, "center");
    const nameW = compact ? 150 : 330, pctW = compact ? 90 : 104, pad = compact ? 18 : 28, inner = w - 2 * pad;
    lines.slice(0, n).forEach((ln, i) => {
      const ry = y + top + head + i * (rowH + gap);
      const nFont = `500 ${compact ? 26 : k(30)}px ${p.f.body}`;
      text(p, fit(p, ln.name, nFont, nameW - 6), sx + w - pad, ry, rowH, nFont, p.look.ink);
      const trackX = sx + w - pad - nameW - 18, trackW = inner - nameW - pctW - 36, th = compact ? 13 : k(15);
      p.ctx.fillStyle = p.look.track; p.ctx.beginPath(); p.ctx.roundRect(trackX - trackW, ry + rowH / 2 - th / 2, trackW, th, 6); p.ctx.fill();
      p.ctx.fillStyle = p.look.bar; p.ctx.beginPath(); p.ctx.roundRect(trackX - trackW * Math.min(1, ln.share / 100), ry + rowH / 2 - th / 2, trackW * Math.min(1, ln.share / 100), th, 6); p.ctx.fill();
      text(p, ltrText(ln.text), sx + pad, ry, rowH, `700 ${compact ? 28 : k(32)}px ${p.f.num}`, p.look.ink, "left");
    });
  } };
}

/** "לאן הלכו": כל היעדים בשורה אחת בתגיות; "נשארו במפלגה" מתקצר ל"נשארו" ואז מתווספות תגיות עד שנגמר המקום */
function tagsBlock(p: Pen, title: string, lines: FlowLine[], sx = L, w = CW, compact = false, m = 1): Block {
  const k = (v: number) => (compact ? v : Math.round(v * m)), titled = title !== "";
  const tl = compact ? 34 : k(41), ch = compact ? 46 : k(54), top = 16, h = top + (titled ? tl + 8 : 0) + ch + (compact ? 14 : k(18));
  const size = compact ? 26 : k(30), padX = compact ? 16 : k(24), gap = compact ? 8 : 12;
  const chip = (ln: FlowLine, short: boolean) => {
    const name = short && ln.short ? ln.short : ln.name, nf = `600 ${size}px ${p.f.display}`, pf = `700 ${size + 1}px ${p.f.num}`;
    return { name, text: ltrText(ln.text), w: width(p, name, nf) + 10 + width(p, ltrText(ln.text), pf) + 2 * padX, nf, pf };
  };
  const layout = (maxW: number) => {
    for (let n = lines.length; n >= 1; n--) for (const short of [false, true]) {
      const chips = lines.slice(0, n).map((ln) => chip(ln, short));
      if (chips.reduce((s, c) => s + c.w, 0) + gap * (n - 1) <= maxW) return chips;
    }
    return lines.length ? [chip(lines[0], true)] : [];
  };
  return { min: 1, max: 1, height: () => h, draw: (y) => {
    card(p, sx, y, w, h);
    if (titled) text(p, title, sx + w / 2, y + top, tl, `700 ${compact ? 28 : fitSize(p, title, 700, p.f.display, k(34), w - 40)}px ${p.f.display}`, p.look.accent, "center");
    const chips = layout(w - 2 * (compact ? 18 : 28)), total = chips.reduce((s, c) => s + c.w, 0) + gap * (chips.length - 1);
    let x = sx + w / 2 + total / 2;
    const ty = y + top + (titled ? tl + 8 : 0);
    for (const c of chips) {
      p.ctx.fillStyle = p.look.tag; p.ctx.beginPath(); p.ctx.roundRect(x - c.w, ty, c.w, ch, ch / 2); p.ctx.fill();
      text(p, c.name, x - padX, ty, ch, c.nf, p.look.ink);
      text(p, c.text, x - c.w + padX, ty, ch, c.pf, p.look.ink, "left");
      x -= c.w + gap;
    }
  } };
}

/** חרדים: כותרות המפלגות מחוץ לכרטיסים, וכרטיס לרוחב לכל פרמטר — שם הפרמטר פעם אחת, וקווי הפרדה קטועים משמאל לשם ובאמצע */
function haredParams(p: Pen, blocks: PartyBlock[]): Block {
  const keys = blocks[0].params.map((c) => c.key), nameW = 230, cardH = 92, gap = 10, head = 46;
  return { min: 1, max: 1, height: () => head + keys.length * cardH + (keys.length - 1) * gap, draw: (y) => {
    const colW = (CW - nameW) / 2;
    blocks.forEach((b, i) => text(p, b.name, R - nameW - colW * (i + 0.5), y, 40, `800 36px ${p.f.display}`, p.look.ink, "center"));
    keys.forEach((key, r) => {
      const cy = y + head + r * (cardH + gap);
      card(p, L, cy, CW, cardH);
      const label = blocks[0].params[r].label;
      text(p, label, R - 24, cy, cardH, `600 28px ${p.f.display}`, p.look.soft);
      lineOf(R - nameW, cy + 14, cy + cardH - 14, p); lineOf(R - nameW - colW, cy + 14, cy + cardH - 14, p);
      blocks.forEach((b, i) => {
        const c = b.params[r], cx = R - nameW - colW * (i + 0.5);
        if (key === "votes") {
          text(p, ltrText(c.value), cx, cy + 10, 44, `800 36px ${p.f.num}`, p.look.ink, "center");
          const cw = changeWidth(p, c.change, 27);
          if (c.change) drawChange(p, c.change, cx - cw / 2, cy + 10 + 44, 32, 27);
        } else {
          const vw = width(p, ltrText(c.value), `800 34px ${p.f.num}`), cw = changeWidth(p, c.change, 27), gp = c.change ? 14 : 0, total = vw + gp + cw;
          text(p, ltrText(c.value), cx + total / 2, cy, cardH, `800 34px ${p.f.num}`, p.look.ink, "right");
          if (c.change) drawChange(p, c.change, cx - total / 2, cy, cardH, 27);
        }
      });
    });
  } };
}

/** שני כרטיסים נפרדים, כרטיס לכל מפלגה, תחת כותרת באמצע; הציור של כל כרטיס מקבל את אותו מספר שורות */
function pairBlock(p: Pen, title: string, small: string | null, make: (b: PartyBlock, x: number, w: number) => Block, blocks: PartyBlock[]): Block {
  const w = (CW - 14) / 2, cards = blocks.map((b, i) => make(b, R - w - i * (w + 14), w));
  const head = 44;
  return {
    min: Math.max(...cards.map((c) => c.min)), max: Math.min(...cards.map((c) => c.max)) || Math.max(...cards.map((c) => c.min)),
    height: (n) => head + Math.max(...cards.map((c) => c.height(n))),
    draw: (y, n) => {
      const tFont = `700 35px ${p.f.display}`, sFont = `500 23px ${p.f.display}`, tw = width(p, title, tFont), sw = small ? width(p, small, sFont) : 0;
      const start = W / 2 + (tw + (small ? 12 + sw : 0)) / 2;
      text(p, title, start, y, 40, tFont, p.look.accent);
      if (small) text(p, small, start - tw - 12, y + 6, 34, sFont, p.look.soft);
      cards.forEach((c) => c.draw(y + head, n));
    },
  };
}

/** שורות "ערים" של מפלגה בכרטיס צר: שם, שינוי ובקטן האחוז מבעלי זכות הבחירה */
function cityColumn(p: Pen, cities: CityLine[], x: number, w: number): Block {
  const rowH = 52, ph = (n: number) => 12 + n * rowH + 12;
  return { min: Math.min(1, cities.length), max: cities.length, height: ph, draw: (y, n) => {
    card(p, x, y, w, ph(n));
    cities.slice(0, n).forEach((c, i) => {
      const ry = y + 12 + i * rowH;
      if (i) hline(x + 20, x + w - 20, ry, p);
      text(p, fit(p, c.name, `500 29px ${p.f.body}`, w * 0.42), x + w - 20, ry, rowH, `500 29px ${p.f.body}`, p.look.ink);
      if (c.small) text(p, ltrText(c.small), x + 20, ry, rowH, `500 22px ${p.f.num}`, p.look.soft, "left");
      const sw = c.small ? width(p, ltrText(c.small), `500 22px ${p.f.num}`) + 12 : 0;
      drawChange(p, c.change, x + 20 + sw, ry, rowH, 29);
    });
  } };
}

/** כל המפלגות: כותרות עמודות ושורת כרטיס לכל רשימה, הנתון ומתחתיו השינוי */
function tableBlock(p: Pen, headers: string[], rows: TableRow[]): Block {
  const rowH = 54, gap = 4, head = 34;
  return { min: rows.length, max: rows.length, height: () => head + rows.length * (rowH + gap), draw: (y) => {
    const inner = CW - 28, nameW = inner * (2.1 / (2.1 + headers.length)), colW = (inner - nameW) / headers.length;
    headers.forEach((hd, i) => text(p, hd, R - 14 - nameW - colW * (i + 0.5), y, 30, `700 25px ${p.f.display}`, p.look.accent, "center"));
    rows.forEach((row, r) => {
      const ry = y + head + r * (rowH + gap);
      card(p, L, ry, CW, rowH, 22);
      text(p, fit(p, row.name, `700 27px ${p.f.display}`, nameW - 8), R - 14, ry, rowH, `700 27px ${p.f.display}`, p.look.ink);
      row.cells.forEach((c, i) => {
        const cx = R - 14 - nameW - colW * (i + 0.5);
        text(p, ltrText(c.value), cx, ry + 5, 28, `700 25px ${p.f.num}`, p.look.ink, "center");
        const cw = changeWidth(p, c.change, 19);
        if (c.change) drawChange(p, c.change, cx - cw / 2, ry + 5 + 28, 20, 19);
      });
    });
  } };
}

/** כותרת התמונה: שם, ומתחתיו בקטן "94% מספירת הקולות" */
function header(p: Pen, title: string, sub: string, maxW: number): number {
  let size = 62;
  while (size > 40 && width(p, title, `800 ${size}px ${p.f.display}`) > maxW) size -= 2;
  text(p, title, W / 2, TOP, 68, `800 ${size}px ${p.f.display}`, p.look.ink, "center");
  let y = TOP + 68;
  if (sub) { text(p, sub, W / 2, y + 4, 34, `500 28px ${p.f.body}`, p.look.soft, "center"); y += 38; }
  return y + 8;
}

function background(p: Pen) {
  const { ctx, look } = p;
  ctx.fillStyle = look.bg; ctx.fillRect(0, 0, W, H);
  if (!look.glow) return;
  const glow = (x: number, y: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 490); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.85, H * 0.06, "47,116,216", 0.34); glow(W * 0.08, H * 0.96, "227,38,47", 0.3);
}

/** מסגרת הגזרה: טבעת עגולה בהדרגה כחול ⇐ אדום, תמיד */
function ring(p: Pen) {
  const { ctx } = p, g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#2f74d8"); g.addColorStop(1, "#e3262f");
  ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(27, 27, W - 54, H - 54, 43); ctx.stroke(); ctx.restore();
}

function footer(p: Pen) {
  const y = H - BOTTOM - FOOT, host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  text(p, "השוואת כל הקלפיות", R, y + 6, 40, `700 36px ${p.f.body}`, p.look.ink);
  text(p, ltrText(host), R, y + 54, 38, `400 33px ${p.f.num}`, p.look.soft);
  drawQr(p.ctx, `${SITE_URL}#/changes`, L, y, QR);
}

/** מקצה שורות לבלוקים לפי המקום: קודם המינימום, אחר כך מוסיפים שורות בסדר עדיפות, והשאר מתפזר כרווח */
function place(blocks: Block[], priority: number[], top: number) {
  const bottom = H - BOTTOM - FOOT - 16, avail = bottom - top;
  const counts = blocks.map((b) => b.min);
  const total = () => blocks.reduce((s, b, i) => s + b.height(counts[i]), 0) + GAP * (blocks.length - 1);
  for (let grew = true; grew;) {
    grew = false;
    for (const i of priority) {
      if (counts[i] >= blocks[i].max) continue;
      counts[i]++;
      if (total() <= avail) grew = true; else counts[i]--;
    }
  }
  const extra = Math.max(0, avail - total()), spread = blocks.length > 1 ? Math.min(34, extra / (blocks.length - 1)) : 0, gap = GAP + spread;
  let y = top + Math.max(0, extra - spread * (blocks.length - 1)) / 3;
  blocks.forEach((b, i) => { b.draw(y, counts[i]); y += b.height(counts[i]) + gap; });
}

export interface DrawOptions { theme: ShareTheme; logo?: ImageBitmap | null }

export async function drawScene(scene: Scene, { theme, logo }: DrawOptions): Promise<Blob> {
  const { display, body, num } = await sharePalette();
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const p: Pen = { ctx, look: LOOKS[theme], f: { display, body, num } };
  background(p);
  const top = header(p, scene.title, scene.sub, logo ? 760 : CW);
  /** בונה את הבלוקים לפי מקדם גודל; בתמונות מפלגה וגם בעיר — אם כל הנתונים נכנסים ויש מקום, הכול גדל */
  const build = (m: number) => {
    const blocks: Block[] = [], priority: number[] = [];
    if (scene.kind === "all" && scene.table) blocks.push(tableBlock(p, scene.table.headers, scene.table.rows));
    else if (scene.kind === "party") {
      const b = scene.blocks[0];
      blocks.push(paramBlock(p, b.params, m));
      if (scene.withCities && b.cities.length) { priority.push(blocks.length); blocks.push(citiesBlock(p, b.cities, m)); }
      if (b.from.length) { priority.push(blocks.length); blocks.push(barsBlock(p, "מאיפה הגיעו מצביעי המפלגה בבחירות הנוכחיות", b.from, L, CW, false, m)); }
      if (b.to.length) blocks.push(tagsBlock(p, "לאן הלכו מצביעי המפלגה בבחירות הקודמות", b.to, L, CW, false, m));
    } else {
      const bs = scene.blocks;
      blocks.push(haredParams(p, bs));
      if (scene.withCities && bs.every((b) => b.cities.length)) blocks.push(pairBlock(p, "השינוי הגדול ביותר", "מבעלי זכות הבחירה", (b, x, w) => cityColumn(p, b.cities, x, w), bs));
      if (bs.every((b) => b.from.length)) blocks.push(pairBlock(p, "מאיפה הגיעו", null, (b, x, w) => barsBlock(p, "", b.from, x, w, true), bs));
      if (bs.every((b) => b.to.length)) blocks.push(pairBlock(p, "לאן הלכו", null, (b, x, w) => tagsBlock(p, "", b.to, x, w, true), bs));
      blocks.forEach((_, i) => { if (i) priority.push(i); });
    }
    return { blocks, priority };
  };
  const sizes = scene.kind === "party" ? [1.3, 1.2, 1.1, 1] : [1];
  let chosen = build(1);
  for (const m of sizes) {
    const c = build(m);
    if (c.blocks.reduce((s, b) => s + b.height(b.max), 0) + GAP * (c.blocks.length - 1) <= H - BOTTOM - FOOT - 16 - top) { chosen = c; break; }
  }
  place(chosen.blocks, chosen.priority, top);
  footer(p);
  if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(W - 100, 100, 36, 0, 2 * Math.PI); ctx.clip(); ctx.drawImage(logo, W - 136, 64, 72, 72); ctx.restore(); }
  ring(p);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/png"));
}
