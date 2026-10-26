/**
 * סרטון הנתונים (הכרעת בעלים 26.10.2026): 20 שניות לאורך, נבנה כולו בדפדפן מנתוני האתר — בלי AI ובלי שרת.
 * פונקציה אחת מציירת כל פריים לפי הזמן; אותם נתונים ⇐ אותו סרטון בדיוק (אין אקראיות, רק `rnd` קבוע).
 * הסדר: פתיח · מי צודק · 13 הרשימות · העוגות · החרדים · הפער הגדול · הזמנה · מונה.
 */
import { seatsFmt } from "./format";

export const PROMO = { W: 1080, H: 1920, FPS: 30, DUR: 20 } as const;
export interface PromoList { id: string; name: string; polls: number; crowd: number; mine?: number; img: CanvasImageSource | null }
/** shown = השלמים שהאתר מציג (blocSlices), כדי שהסרטון והעוגה באתר יראו אותו מספר */
export interface PromoBloc { id: string; short: string; polls: number; crowd: number; mine?: number; shown: { polls: number; crowd: number; mine?: number }; color: string }
export interface PromoData {
  asOf: string; lists: PromoList[]; blocs: PromoBloc[]; haredi: { id: string; name: string; polls: number; crowd: number; mine?: number }[];
  gap: PromoList; guesses: number; goal: number; host: string; logo: CanvasImageSource | null; qr: boolean[][];
}
/** קנבסים זמניים למעברים — נוצרים פעם אחת */
export interface PromoFx { layer: HTMLCanvasElement | OffscreenCanvas; small: HTMLCanvasElement | OffscreenCanvas; grain: HTMLCanvasElement | OffscreenCanvas }
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const { W, H } = PROMO;
/** גבולות המסכים בשניות — על רשת של חצי פעמה (120 BPM), כמו המוזיקה */
export const SCENES = { open: 0, who: 1.5, chart: 3.5, pies: 7.5, haredi: 10.5, gap: 13.5, invite: 15.5, count: 17.5, end: 20 } as const;
/** מכות המוזיקה: רעידה קצרה בכל אחת. בזמני הקריאה (5.5–7.5, 11.5–13.5) אין מכות */
const HITS = [0, 1.5, 1.875, 2.25, 2.75, 3.5, 7.5, 10.5, 13.5, 14.25, 15.5, 16.5, 17.5, 18.9];
const FLASH: [number, number][] = [[1.5, .9], [3.5, .5], [7.5, .7], [10.5, .35], [17.5, .6]];
/** צבעי סמל הגזרה על רקע כהה; הגושים — כמו טוקני הגזרה באתר (נתניהו כחול, אייזנקוט אדום) */
export const PC = { bg: "#05070d", ink: "#ffffff", soft: "rgba(255,255,255,.62)", faint: "rgba(255,255,255,.1)", blue: "#2f74d8", blueHi: "#7fb0f2", red: "#e3262f", redHi: "#ff6b72", gold: "#b2781c", goldHi: "#e2b25c" };
export const BLOC_COLORS: Record<string, string> = { netanyahu: "#2f74d8", eisenkot: "#e3262f", haredi: "#9aa8b8", arab: "#5d6b7c" };
const HE = '"Rubik", sans-serif', NUM = '"Roboto Mono", "Rubik", sans-serif';

const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const pr = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const eo = (x: number) => 1 - Math.pow(1 - x, 3);
const eio = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const back = (x: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const num = (v: number) => seatsFmt(Math.round(v * 10) / 10);
const thousands = (n: number) => Math.round(n).toLocaleString("en-US");

function text(c: Ctx, s: string, x: number, y: number, size: number, opt: { w?: number; color?: string; align?: CanvasTextAlign; font?: string; ltr?: boolean } = {}) {
  c.font = `${opt.w ?? 700} ${size}px ${opt.font ?? HE}`; c.fillStyle = opt.color ?? PC.ink;
  c.textAlign = opt.align ?? "center"; c.textBaseline = "middle"; c.direction = opt.ltr ? "ltr" : "rtl";
  c.fillText(s, x, y);
}
/** הטקסט מוקטן עד שהוא נכנס ברוחב */
function fit(c: Ctx, s: string, max: number, size: number, w = 700, font = HE) {
  c.font = `${w} ${size}px ${font}`;
  while (c.measureText(s).width > max && size > 14) { size -= 2; c.font = `${w} ${size}px ${font}`; }
  return size;
}
function pill(c: Ctx, x: number, y: number, w: number, h: number, fill: string | CanvasGradient) {
  c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fillStyle = fill; c.fill();
}
function avatar(c: Ctx, img: CanvasImageSource | null, x: number, y: number, r: number, label = "") {
  c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = "#1a2030"; c.fill(); c.clip();
  if (img) c.drawImage(img, x - r, y - r, r * 2, r * 2); else text(c, label.slice(0, 2), x, y, r * .8);
  c.restore();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 2; c.stroke();
}

/** רקע חי: זוהר כחול ואדום שנע ופועם על הביט, אלומת אור אלכסונית וגרעין. ממשיך לנוע גם כשהתוכן קפוא, ולא מסתיר אותו */
function background(c: Ctx, t: number, fx: PromoFx) {
  c.fillStyle = PC.bg; c.fillRect(0, 0, W, H);
  const beat = Math.exp(-((t + 1e-3) % .5) * 7);
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };
  glow(860 + 90 * Math.sin(t * .6), 260 + 120 * Math.cos(t * .45), 980, "47,116,216", .34 + .1 * beat);
  glow(220 + 80 * Math.cos(t * .5), 1660 + 100 * Math.sin(t * .4), 980, "227,38,47", .28 + .1 * beat);
  const pos = ((t * .32) % 1.7) - .35;
  c.save(); c.translate(W / 2, H / 2); c.rotate(-.42);
  const bx = pos * 2600 - 1300, g = c.createLinearGradient(bx - 220, 0, bx + 220, 0);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.5, "rgba(255,255,255,.055)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(-1600, -1600, 3200, 3200); c.restore();
  const v = c.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  // גרעין קבוע (לא משתנה בכל פריים) — אחרת הקובץ מתנפח פי עשרה
  c.save(); c.globalAlpha = .05; const ox = 0, oy = 0;
  for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) c.drawImage(fx.grain, x, y);
  c.restore();
}

/** לוגו קטן, שנת הבחירות ושורת השקיפות — מהמסך השני ואילך */
function chrome(c: Ctx, d: PromoData, a: number) {
  if (a <= 0) return;
  c.save(); c.globalAlpha = a;
  avatar(c, d.logo, W - 104, 112, 52);
  text(c, "בחירות 2026", W - 176, 112, 38, { w: 800, align: "right" });
  text(c, `נתוני האתר · ${d.asOf} · ניחושי המשתתפים אינם סקר`, W / 2, H - 52, 26, { w: 500, color: PC.soft });
  c.restore();
}

// ── 1. פתיח ─────────────────────────────────────────────────────────────────
function sceneOpen(c: Ctx, t: number, d: PromoData) {
  const z = Math.pow(pr(t, 1.18, 1.5), 3);  // צלילה לתוך הסמל
  c.save(); c.translate(540, 760); c.scale(1 + z * 16, 1 + z * 16); c.translate(-540, -760); c.globalAlpha = 1 - pr(t, 1.38, 1.5);
  for (let i = 0; i < 3; i++) {
    const k = pr(t, i * .18, i * .18 + 1.1);
    if (k > 0 && k < 1) { c.beginPath(); c.arc(540, 760, 270 + k * 760, 0, Math.PI * 2); c.strokeStyle = `rgba(${i % 2 ? "227,38,47" : "127,176,242"},${.55 * (1 - k)})`; c.lineWidth = 10 * (1 - k) + 2; c.stroke(); }
  }
  const s = 1 + .14 * Math.exp(-t * 6);
  c.save(); c.translate(540, 760); c.scale(s, s); avatar(c, d.logo, 0, 0, 270); c.restore();
  const up = 40 * Math.exp(-t * 5);
  text(c, "בחירות 2026 · 27.10", 540, 330 + up * .5, 44, { w: 600, color: PC.soft });
  text(c, "מחר התוצאות.", 540, 1205 + up, 112, { w: 900 });
  text(c, "הנה מה שכולם צופים.", 540, 1335 + up * 1.4, 84, { w: 800, color: PC.blueHi });
  c.restore();
}

// ── 2. מי צודק ──────────────────────────────────────────────────────────────
function slam(c: Ctx, t: number, h: number, draw: () => void) {
  if (t < h) return;
  const k = pr(t, h, h + .14), s = 1 + 1.3 * (1 - eo(k));
  c.save(); c.globalAlpha *= cl((t - h) / .05); c.translate(540, 0); c.scale(s, s); c.translate(-540, 0); draw(); c.restore();
}
function sceneWho(c: Ctx, t: number, frame: number) {
  const out = pr(t, 2.72, 2.84);
  c.save(); c.globalAlpha = 1 - out; c.translate(540, 960); c.scale(1 + out * .4, 1 + out * .4); c.translate(-540, -960);
  slam(c, t, 1.5, () => text(c, "הסקרים", 540, 700, 200, { w: 900, color: PC.blueHi }));
  slam(c, t, 1.875, () => text(c, "מול", 540, 905, 120, { w: 800 }));
  slam(c, t, 2.25, () => text(c, "הניחושים", 540, 1110, 200, { w: 900, color: PC.redHi }));
  c.restore();
  if (t >= 2.75) slam(c, t, 2.75, () => {
    const j = (rnd(frame) - .5) * 22, k = 6 + 10 * Math.exp(-(t - 2.75) * 6);
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha *= .8;
    const z = fit(c, "מי צודק?", 960, 250, 900);
    text(c, "מי צודק?", 540 - k + j, 960, z, { w: 900, color: PC.blue });
    text(c, "מי צודק?", 540 + k - j, 960, z, { w: 900, color: PC.red });
    c.restore(); text(c, "מי צודק?", 540, 960, z, { w: 900 });
  });
}

// ── 3. 13 הרשימות ───────────────────────────────────────────────────────────
const AX = { right: 680, left: 110 };
/** סוף הציר: 32 כמו באתר, וגדל בקפיצות של 8 כשרשימה עוברת אותו */
const axisMax = (d: PromoData) => Math.max(32, Math.ceil(Math.max(...d.lists.flatMap(l => [l.polls, l.crowd])) / 8) * 8);
function sceneChart(c: Ctx, t: number, d: PromoData) {
  const head = eo(pr(t, 3.5, 3.8));
  c.save(); c.globalAlpha = head;
  text(c, "הסקרים מול הניחושים", 540, 245 - 30 * (1 - head), 66, { w: 900 });
  // מקרא ממורכז: הסקרים מימין, הניחושים משמאל
  c.font = `600 32px ${HE}`; const lw = (s: string) => c.measureText(s).width + 40, a = lw("ממוצע הסקרים"), b = lw("ממוצע הניחושים"), x1 = 540 + (a + b + 50) / 2;
  pill(c, x1 - 26, 312, 26, 26, PC.blue); text(c, "ממוצע הסקרים", x1 - 40, 326, 32, { w: 600, align: "right" });
  pill(c, x1 - a - 50 - 26, 312, 26, 26, PC.red); text(c, "ממוצע הניחושים", x1 - a - 50 - 40, 326, 32, { w: 600, align: "right" });
  const span = AX.right - AX.left, max = axisMax(d);
  [1, 2, 3, 4].map(q => max * q / 4).forEach(v => { const x = AX.right - v / max * span; c.fillStyle = PC.faint; c.fillRect(x - 1, 380, 2, 1400); text(c, String(v), x, 372, 22, { w: 500, color: PC.soft, font: NUM, ltr: true }); });
  c.restore();
  const n = d.lists.length, top = 400, rowH = Math.min(106, 1390 / n), sheen = t > 5.3 ? ((t - 5.3) % 1.3) / 1.3 : -1;
  d.lists.forEach((l, i) => {
    const k = eo(pr(t, 3.62 + i * .09, 4.07 + i * .09)); if (k <= 0) return;
    const y = top + i * rowH, cy = y + rowH / 2;
    c.save(); c.globalAlpha = k; c.translate(80 * (1 - k), 0);
    if (i) { c.fillStyle = PC.faint; c.fillRect(60, y, W - 120, 1); }
    avatar(c, l.img, W - 98, cy, rowH * .34, l.name);
    const nameMax = W - 98 - rowH * .34 - 18 - (AX.right + 24);
    text(c, l.name, W - 98 - rowH * .34 - 18, cy, fit(c, l.name, nameMax, 34, 600), { w: 600, align: "right" });
    const bar = (v: number, by: number, color: string, hi: string) => {
      const w = Math.max(10, v / max * span * k), x0 = AX.right - w, bh = rowH * .2;
      const g = c.createLinearGradient(AX.right, 0, x0, 0); g.addColorStop(0, color); g.addColorStop(1, hi);
      pill(c, x0, by - bh / 2, w, bh, g);
      if (sheen >= 0) { // ברק עדין שעובר על הקפסולות בזמן הקריאה — לא על המספרים
        const sx = lerp(AX.right + 120, AX.left - 160, sheen), sg = c.createLinearGradient(sx - 90, 0, sx + 90, 0);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(.5, "rgba(255,255,255,.38)"); sg.addColorStop(1, "rgba(255,255,255,0)");
        c.save(); c.beginPath(); c.roundRect(x0, by - bh / 2, w, bh, bh / 2); c.clip(); c.fillStyle = sg; c.fillRect(x0, by - bh, w, bh * 2); c.restore();
      }
      text(c, num(v * k), x0 - 12, by, rowH * .27, { w: 700, font: NUM, align: "right", ltr: true, color: hi });
    };
    bar(l.polls, cy - rowH * .17, PC.blue, PC.blueHi);
    bar(l.crowd, cy + rowH * .17, PC.red, PC.redHi);
    c.restore();
  });
}

// ── 4–5. העוגות והחרדים ──────────────────────────────────────────────────────
type Slice = { id: string; short: string; value: number; color: string };
const TAU = Math.PI * 2;
function shade(hex: string, k: number) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16 & 255) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; }
const midOf = (slices: Slice[], id: string, rot: number) => {
  const total = slices.reduce((a, s) => a + s.value, 0); let a = rot;
  for (const s of slices) { const sp = s.value / total * TAU; if (s.id === id) return a + sp / 2; a += sp; }
  return rot;
};
/** עוגה תלת־ממדית: קירות קדמיים מאחור-לפנים ואז הפנים העליונים; `pop` מוציא פרוסה החוצה ומעמעם את השאר */
function pie3d(c: Ctx, o: { cx: number; cy: number; rx: number; ry: number; depth: number; slices: Slice[]; shown: number[]; rot: number; sweep: number; pop?: { id: string; amt: number; dim: number }; labels: number }) {
  const total = o.slices.reduce((a, s) => a + s.value, 0) || 1;
  let a = o.rot;
  const parts = o.slices.map((s, i) => {
    const sp = s.value / total * TAU * o.sweep, a0 = a, a1 = a + sp; a = a1;
    const m = (a0 + a1) / 2, out = o.pop?.id === s.id ? o.pop.amt : 0;
    return { s, i, a0, a1, m, dx: Math.cos(m) * out, dy: Math.sin(m) * out * o.ry / o.rx, alpha: o.pop && o.pop.id !== s.id ? 1 - o.pop.dim : 1 };
  });
  const order = [...parts].sort((p, q) => Math.sin(p.m) + (p.dx ? 2 : 0) - (Math.sin(q.m) + (q.dx ? 2 : 0)));
  for (const p of order) {
    const cx = o.cx + p.dx, cy = o.cy + p.dy;
    c.save(); c.globalAlpha = p.alpha;
    if (p.dx) for (const e of [p.a0, p.a1]) { // קירות החתך של הפרוסה שיצאה
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(e) * o.rx, cy + Math.sin(e) * o.ry); c.lineTo(cx + Math.cos(e) * o.rx, cy + Math.sin(e) * o.ry + o.depth); c.lineTo(cx, cy + o.depth); c.closePath();
      c.fillStyle = shade(p.s.color, .45); c.fill();
    }
    // הקיר החיצוני: רק החלק הפונה לצופה (sin > 0)
    for (let k = Math.floor(p.a0 / TAU) - 1; k <= Math.ceil(p.a1 / TAU); k++) {
      const s0 = Math.max(p.a0, k * TAU), s1 = Math.min(p.a1, k * TAU + Math.PI);
      if (s1 <= s0) continue;
      c.beginPath(); c.ellipse(cx, cy, o.rx, o.ry, 0, s0, s1); c.ellipse(cx, cy + o.depth, o.rx, o.ry, 0, s1, s0, true); c.closePath();
      const g = c.createLinearGradient(cx - o.rx, 0, cx + o.rx, 0); g.addColorStop(0, shade(p.s.color, .42)); g.addColorStop(.5, shade(p.s.color, .7)); g.addColorStop(1, shade(p.s.color, .42));
      c.fillStyle = g; c.fill();
    }
    c.restore();
  }
  for (const p of parts) {
    if (p.a1 - p.a0 < 1e-4) continue;
    const cx = o.cx + p.dx, cy = o.cy + p.dy;
    const popped = !!p.dx;
    c.save(); c.globalAlpha = p.alpha;
    if (popped) { c.shadowColor = "rgba(255,255,255,.55)"; c.shadowBlur = 40; }
    c.beginPath(); c.moveTo(cx, cy); c.ellipse(cx, cy, o.rx, o.ry, 0, p.a0, p.a1); c.closePath();
    const g = c.createLinearGradient(cx, cy - o.ry, cx, cy + o.ry); g.addColorStop(0, shade(p.s.color, 1.12)); g.addColorStop(1, p.s.color);
    c.fillStyle = g; c.fill(); c.shadowBlur = 0; c.strokeStyle = popped ? "#fff" : PC.bg; c.lineWidth = popped ? 4 : 3; c.stroke();
    const la = popped ? 1 : o.labels;
    if (la > 0) {
      c.globalAlpha = p.alpha * la;
      const lx = cx + Math.cos(p.m) * o.rx * .6, ly = cy + Math.sin(p.m) * o.ry * .6;
      text(c, String(o.shown[p.i]), lx, ly + o.ry * .1, o.rx * .15, { w: 800, font: NUM, ltr: true });
      text(c, p.s.short, lx, ly - o.ry * .2, Math.max(26, o.rx * .085), { w: 700 });
    }
    c.restore();
  }
}
/** עוגה לכל מקור: הסקרים, הניחושים, ואם יש — הניחוש שלי (שלוש עוגות קטנות יותר, באותו מסך ובאותו תזמון) */
const PIE_KINDS = [{ key: "polls", label: "הסקרים", color: PC.blue, hi: PC.blueHi }, { key: "crowd", label: "הניחושים", color: PC.red, hi: PC.redHi }, { key: "mine", label: "הניחוש שלי", color: PC.gold, hi: PC.goldHi }] as const;
function scenePies(c: Ctx, t: number, d: PromoData) {
  const build = pr(t, 7.55, 8.7), sweep = eo(build), labels = pr(t, 8.6, 8.95);
  const rotAt = (tt: number) => -Math.PI / 2 + .5 * (tt - 7.5) + 2.6 * (1 - eo(pr(tt, 7.5, 8.7)));
  const h = eio(pr(t, 10.5, 11.15)), pop = eo(pr(t, 10.7, 11.15)), grow = back(pr(t, 7.5, 8.05));
  const kinds = PIE_KINDS.filter(k => k.key !== "mine" || d.blocs.every(b => b.mine != null)), n = kinds.length;
  // פריסה: שתי עוגות — גדולות; שלוש — קטנות יותר ובמרווח שווה
  const L = n === 3 ? { cys: [560, 1040, 1520], rx: [300, 225], card: 400 } : { cys: [650, 1330], rx: [360, 255], card: 420 };
  const pies = kinds.map((k, i) => {
    const slices: Slice[] = d.blocs.map(b => ({ id: b.id, short: b.short, value: b[k.key] ?? 0, color: b.color }));
    const off = i * .35, r0 = rotAt(Math.min(t, 10.5)) + off, m0 = midOf(slices, "haredi", r0);
    const target = r0 + ((Math.PI / 2 - m0) % TAU + TAU) % TAU;  // החרדים מסתובבים לחזית
    return { k, slices, shown: d.blocs.map(b => b.shown[k.key] ?? 0), rot: t < 10.5 ? r0 : lerp(r0, target, h), cy: L.cys[i] };
  });
  // כותרת: חלוקת הכנסת ⇐ המפלגות החרדיות
  c.save(); c.globalAlpha = eo(pr(t, 7.6, 8)) * (1 - h); text(c, "הכנסת לפי גושים", 540, 240, 66, { w: 900 }); c.restore();
  c.save(); c.globalAlpha = h; text(c, "המפלגות החרדיות", 540, 240, 72, { w: 900 }); c.restore();
  const punch = t >= 10.5 ? 1 + .12 * Math.exp(-(t - 10.5) * 9) : 1;
  c.save(); c.translate(540, 990); c.scale(punch, punch); c.translate(-540, -990);
  pies.forEach((p, i) => {
    const cx = lerp(540, 735, h), rx = lerp(L.rx[0], L.rx[1], h) * grow, ry = rx * .42;
    const tag = eo(pr(t, 7.7 + i * .12, 8.1 + i * .12)), ly = p.cy - lerp(L.rx[0], L.rx[1], h) * .42 - 70;
    c.save(); c.globalAlpha = tag * (1 - h);
    c.font = `800 34px ${HE}`; const pw = c.measureText(p.k.label).width + 60;
    pill(c, 540 - pw / 2, ly - 30, pw, 60, p.k.color); text(c, p.k.label, 540, ly, 34, { w: 800 });
    c.restore();
    if (rx > 1) pie3d(c, { cx, cy: p.cy, rx, ry, depth: rx * .17, slices: p.slices, shown: p.shown, rot: p.rot, sweep, labels: labels * (1 - pop), pop: t > 10.5 ? { id: "haredi", amt: pop * rx * .3, dim: pop * .72 } : undefined });
    // כרטיס המספרים של החרדים
    const ck = eo(pr(t, 10.95 + i * .12, 11.4 + i * .12)); if (ck <= 0) return;
    const hs = p.shown[p.slices.findIndex(s => s.id === "haredi")], ch = L.card, small = n === 3;
    c.save(); c.globalAlpha = ck; c.translate(-60 * (1 - ck), 0);
    const x0 = 60, w = 400, top = p.cy - ch / 2 - 10;
    c.beginPath(); c.roundRect(x0, top, w, ch, 28); c.fillStyle = "rgba(255,255,255,.07)"; c.fill(); c.strokeStyle = p.k.color; c.lineWidth = 3; c.stroke();
    c.font = `800 30px ${HE}`; const cw = c.measureText(p.k.label).width + 48;
    pill(c, x0 + w - 24 - cw, top + 22, cw, 52, p.k.color); text(c, p.k.label, x0 + w - 24 - cw / 2, top + 48, 30, { w: 800 });
    text(c, String(hs), x0 + w / 2, top + (small ? 140 : 160), small ? 120 : 140, { w: 800, font: NUM, ltr: true });
    text(c, "מנדטים", x0 + w / 2, top + (small ? 215 : 246), 30, { w: 600, color: PC.soft });
    // שורה לכל רשימה חרדית; כשיש הרבה — השורות מתכווצות כדי להישאר בכרטיס
    const y0 = top + (small ? 268 : 312), step = Math.min(50, (top + ch - 26 - y0) / Math.max(1, d.haredi.length - .5)), fs = Math.min(32, step * .66);
    d.haredi.forEach((l, j) => {
      const y = y0 + j * step, v = l[p.k.key] ?? 0;
      text(c, l.name, x0 + w - 28, y, fit(c, l.name, w - 150, fs, 600), { w: 600, align: "right" });
      text(c, num(v), x0 + 28, y, fs + 2, { w: 700, font: NUM, align: "left", ltr: true, color: p.k.hi });
    });
    c.restore();
  });
  c.restore();
}

// ── 6. הפער הגדול ────────────────────────────────────────────────────────────
function sceneGap(c: Ctx, t: number, d: PromoData) {
  const l = d.gap, g = Math.round((l.crowd - l.polls) * 10) / 10;
  slam(c, t, 13.55, () => text(c, "הפער הגדול ביותר", 540, 330, 86, { w: 900 }));
  const k = back(pr(t, 13.65, 14));
  c.save(); c.translate(540, 600); c.scale(k, k); avatar(c, l.img, 0, 0, 140, l.name); c.restore();
  c.save(); c.globalAlpha = pr(t, 13.7, 13.9); text(c, l.name, 540, 800, 64, { w: 800 }); c.restore();
  const bar = (v: number, y: number, color: string, hi: string, label: string, s: number) => {
    const k2 = eo(pr(t, s, s + .45)), w = Math.max(20, v / axisMax(d) * 900 * k2), x0 = 990 - w;
    c.save(); c.globalAlpha = pr(t, s, s + .1);
    text(c, label, 990, y - 62, 34, { w: 700, align: "right", color: PC.soft });
    const gr = c.createLinearGradient(990, 0, x0, 0); gr.addColorStop(0, color); gr.addColorStop(1, hi); pill(c, x0, y - 38, w, 76, gr);
    text(c, num(v * k2), x0 + 24, y + 2, 54, { w: 800, font: NUM, align: "left", ltr: true });
    c.restore();
  };
  bar(l.polls, 960, PC.blue, PC.blueHi, "ממוצע הסקרים", 13.8);
  bar(l.crowd, 1130, PC.red, PC.redHi, "ממוצע הניחושים", 13.95);
  slam(c, t, 14.25, () => {
    text(c, `${g > 0 ? "+" : g < 0 ? "−" : ""}${seatsFmt(Math.abs(g))}`, 540, 1400, 280, { w: 900, font: NUM, ltr: true, color: g >= 0 ? PC.redHi : PC.blueHi });
    text(c, g >= 0 ? "מנדטים יותר בניחושים" : "מנדטים פחות בניחושים", 540, 1585, 54, { w: 700 });
  });
}

// ── 7. הזמנה ────────────────────────────────────────────────────────────────
function sceneInvite(c: Ctx, t: number) {
  const line = (s: string, y: number, size: number, color: string, at: number) => {
    const k = eo(pr(t, at, at + .25)); if (k <= 0) return;
    c.save(); c.globalAlpha = k; c.beginPath(); c.rect(0, y - size * .75, W, size * 1.5); c.clip();
    text(c, s, 540, y + size * (1 - k), size, { w: 900, color }); c.restore();
  };
  line("כל הנתונים", 640, 128, PC.ink, 15.55);
  line("המלאים באתר.", 790, 128, PC.blueHi, 15.8);
  const u = eo(pr(t, 16.05, 16.4)); c.fillStyle = PC.blue; c.fillRect(540 - 330 * u, 890, 660 * u, 10);
  line("הניחוש שלך", 1100, 120, PC.redHi, 16.5);
  line("משפר את הדיוק.", 1250, 104, PC.ink, 16.75);
}

// ── 8. מונה ─────────────────────────────────────────────────────────────────
function sceneCount(c: Ctx, t: number, d: PromoData) {
  const fade = (at: number) => eo(pr(t, at, at + .3));
  c.save(); c.globalAlpha = fade(17.55); text(c, "כבר ניחשו", 540, 330, 72, { w: 800, color: PC.soft }); c.restore();
  const n = d.guesses * eo(pr(t, 17.6, 18.9)), pop = t > 18.9 ? 1 + .08 * Math.exp(-(t - 18.9) * 8) : 1;
  const big = fit(c, thousands(d.guesses), 900, 230, 700, NUM);  // הגודל לפי המספר הסופי, כדי שלא יקפוץ בספירה
  c.save(); c.translate(540, 520); c.scale(pop, pop); text(c, thousands(n), 0, 0, big, { w: 700, font: NUM, ltr: true }); c.restore();
  const bx = 90, bw = 900, by = 690, fill = Math.min(1, n / d.goal);
  c.save(); c.globalAlpha = fade(17.6);
  pill(c, bx, by, bw, 40, "rgba(255,255,255,.12)");
  const g = c.createLinearGradient(bx + bw, 0, bx, 0); g.addColorStop(0, PC.blue); g.addColorStop(1, PC.red);
  if (fill > 0) pill(c, bx + bw - bw * fill, by, Math.max(40, bw * fill), 40, g);
  text(c, "0", bx + bw, by + 78, 30, { w: 600, font: NUM, ltr: true, color: PC.soft, align: "right" });
  text(c, thousands(d.goal), bx, by + 78, 30, { w: 700, font: NUM, ltr: true, align: "left" });
  c.restore();
  c.save(); c.globalAlpha = fade(18.1); text(c, `בואו נגיע ל־${thousands(d.goal)}`, 540, 900, 88, { w: 900 }); c.restore();
  c.save(); c.globalAlpha = fade(18.3); text(c, "יותר ניחושים = נתונים מדויקים יותר", 540, 1000, 46, { w: 600, color: PC.soft }); c.restore();
  const q = back(pr(t, 18.5, 18.95)), qs = 360;
  if (q > 0) {
    c.save(); c.translate(540, 1330); c.scale(q, q);
    c.beginPath(); c.roundRect(-qs / 2 - 26, -qs / 2 - 26, qs + 52, qs + 52, 30); c.fillStyle = "#fff"; c.fill();
    const m = d.qr.length, cell = qs / Math.max(1, m); c.fillStyle = "#05070d";
    d.qr.forEach((row, r) => row.forEach((on, k) => { if (on) c.fillRect(-qs / 2 + k * cell, -qs / 2 + r * cell, cell + .5, cell + .5); }));
    c.restore();
  }
  c.save(); c.globalAlpha = fade(18.7); text(c, d.host, 540, 1640, 60, { w: 800, color: PC.blueHi, ltr: true }); c.restore();
}

// ── מעברים — כל אחד שונה ────────────────────────────────────────────────────
function layerOf(fx: PromoFx, draw: (c: Ctx) => void) {
  const l = fx.layer.getContext("2d") as Ctx; l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, W, H); draw(l); return fx.layer;
}
/** גליץ': פסים אופקיים שזזים והפרדת צבע */
function glitch(c: Ctx, src: CanvasImageSource, amt: number, seed: number) {
  c.drawImage(src, 0, 0);
  if (amt <= 0) return;
  c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = .35 * amt;
  c.drawImage(src, -18 * amt, 0); c.drawImage(src, 18 * amt, 0); c.restore();
  for (let i = 0; i < 22; i++) {
    const y = rnd(seed * 31 + i) * H, h = 12 + rnd(seed * 17 + i) * 130, dx = (rnd(seed * 7 + i) - .5) * 420 * amt;
    c.drawImage(src, 0, y, W, h, dx, y, W, h);
    if (rnd(seed + i * 3) > .7) { c.fillStyle = rnd(i + seed) > .5 ? `rgba(47,116,216,${.5 * amt})` : `rgba(227,38,47,${.5 * amt})`; c.fillRect(0, y, W, h * .3); }
  }
}
/** קרע: החצי העליון והתחתון נקרעים לצדדים לאורך תפר משונן */
function tear(c: Ctx, src: CanvasImageSource, k: number) {
  const zig = (dir: 1 | -1) => { c.beginPath(); c.moveTo(0, dir < 0 ? 0 : H); c.lineTo(0, 960); for (let x = 0; x <= W; x += 60) c.lineTo(x, 960 + (rnd(x) - .5) * 120); c.lineTo(W, dir < 0 ? 0 : H); c.closePath(); };
  for (const dir of [-1, 1] as const) { c.save(); c.translate(dir * k * 1300, dir * k * 120); c.rotate(dir * k * .05); zig(dir); c.clip(); c.drawImage(src, 0, 0); c.restore(); }
  if (k < .35) { c.save(); c.globalAlpha = 1 - k / .35; c.strokeStyle = "#fff"; c.lineWidth = 8; c.shadowColor = PC.blueHi; c.shadowBlur = 30; c.beginPath(); c.moveTo(0, 960); for (let x = 0; x <= W; x += 60) c.lineTo(x, 960 + (rnd(x) - .5) * 120); c.stroke(); c.restore(); }
}
/** פסיפס פיקסלים */
function pixelate(c: Ctx, src: CanvasImageSource, block: number, fx: PromoFx) {
  if (block <= 1) { c.drawImage(src, 0, 0); return; }
  const w = Math.max(1, Math.round(W / block)), h = Math.max(1, Math.round(H / block)), s = fx.small.getContext("2d") as Ctx;
  s.clearRect(0, 0, fx.small.width, fx.small.height); s.drawImage(src, 0, 0, w, h);
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(fx.small, 0, 0, w, h, 0, 0, W, H); c.restore();
}
/** תריסים אלכסוניים: פסים בכחול, אדום ושחור שמכסים ופותחים */
function shutters(c: Ctx, k: number) {
  c.save(); c.translate(W / 2, H / 2); c.rotate(-.35);
  const cols = [PC.blue, PC.bg, PC.red, PC.bg, PC.blue, PC.red, PC.bg, PC.blue], bh = 2600 / cols.length;
  cols.forEach((col, i) => {
    const d = i * .06, inK = eio(cl((k - d) / .4)), outK = eio(cl((k - .5 - d) / .4)), x = (1 - inK) * 2600 - outK * 2600;
    c.fillStyle = col; c.fillRect(x - 1300, -1300 + i * bh, 2600, bh + 2);
  });
  c.restore();
}

/** כל הפריים: רקע ⇐ מסך + מעבר ⇐ לוגו ושורת מקור ⇐ הבזקים */
export function drawPromo(c: Ctx, t: number, d: PromoData, fx: PromoFx) {
  const frame = Math.round(t * PROMO.FPS);
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  background(c, t, fx);
  const shake = HITS.reduce((a, h) => a + (t >= h ? 16 * Math.exp(-(t - h) * 13) : 0), 0);
  c.save(); c.translate((rnd(frame * 3) - .5) * shake, (rnd(frame * 5) - .5) * shake);
  if (t < SCENES.who) sceneOpen(c, t, d);
  else if (t < 3.32) sceneWho(c, t, frame);
  else if (t < 3.68) { // גליץ' החוצה ופנימה
    const outGoing = t < SCENES.chart, src = layerOf(fx, l => outGoing ? sceneWho(l, t, frame) : sceneChart(l, t, d));
    glitch(c, src, outGoing ? pr(t, 3.32, 3.5) : 1 - pr(t, 3.5, 3.68), frame);
  } else if (t < 7.22) sceneChart(c, t, d);
  else if (t < SCENES.pies) { // איריס: הגרף נבלע במעגל שמתכווץ
    const k = eio(pr(t, 7.22, 7.5)), r = lerp(1250, 0, k);
    c.save(); c.beginPath(); c.arc(540, 960, Math.max(r, .1), 0, TAU); c.clip();
    c.translate(540, 960); c.rotate(-.35 * k); c.scale(1 - .25 * k, 1 - .25 * k); c.translate(-540, -960); sceneChart(c, t, d); c.restore();
    c.beginPath(); c.arc(540, 960, r, 0, TAU); c.strokeStyle = PC.blueHi; c.lineWidth = 12; c.shadowColor = PC.blueHi; c.shadowBlur = 40; c.stroke(); c.shadowBlur = 0;
  } else if (t < 13.25) scenePies(c, t, d);
  else if (t < 13.75) { // תריסים
    const k = pr(t, 13.25, 13.75);
    if (k < .55) scenePies(c, t, d); else sceneGap(c, t, d);
    shutters(c, k);
  } else if (t < 15.3) sceneGap(c, t, d);
  else if (t < 15.55) { sceneInvite(c, Math.max(t, 15.5)); tear(c, layerOf(fx, l => sceneGap(l, 15.3, d)), eio(pr(t, 15.3, 15.55))); }
  else if (t < 17.3) sceneInvite(c, t);
  else if (t < 17.75) { // פסיפס פיקסלים: מתפרק ומתחבר מחדש
    const outGoing = t < SCENES.count, k = outGoing ? pr(t, 17.3, 17.5) : 1 - pr(t, 17.5, 17.75);
    pixelate(c, layerOf(fx, l => outGoing ? sceneInvite(l, t) : sceneCount(l, t, d)), 1 + Math.pow(k, 1.5) * 90, fx);
  } else sceneCount(c, t, d);
  c.restore();
  chrome(c, d, t < SCENES.who ? 0 : 1);
  const flash = FLASH.reduce((a, [h, s]) => a + (t >= h ? s * Math.exp(-(t - h) * 11) : 0), 0);
  if (flash > .01) { c.fillStyle = `rgba(255,255,255,${Math.min(.9, flash)})`; c.fillRect(0, 0, W, H); }
  if (t >= 10.5 && t < 11) { c.fillStyle = `rgba(227,38,47,${.28 * Math.exp(-(t - 10.5) * 9)})`; c.fillRect(0, 0, W, H); }
}

/** קנבסי העזר. `make` — יצירת קנבס בסביבה (דפדפן) */
export function promoFx(make: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas): PromoFx {
  const grain = make(256, 256), g = grain.getContext("2d") as Ctx, img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = rnd(i * .37) * 255; img.data.set([v, v, v, 255], i * 4); }
  g.putImageData(img, 0, 0);
  return { layer: make(W, H), small: make(W, H), grain };
}
