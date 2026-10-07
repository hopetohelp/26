/**
 * תמונת שיתוף להשערה (PNG, ‏1080×1350): חצי העיגול של 120 המושבים, הרשימות הגדולות וכתובת האתר.
 * הצבעים נקראים ממשתני ה-CSS של העיצוב הפעיל (בהיר/חשוך, מקצועי/חדשותי) — אין כאן צבע קבוע, מלבד צבעי הרשימות
 * הניטרליים מ-src/lib/colors.ts. הטקסט מימין לשמאל. בלי המלצה ובלי אימוג'י.
 */
import { colorOf } from "../../lib/colors";
import { SITE_URL } from "../../lib/shareGuess";
import type { BlocTotal } from "./blocSummary";
import { IDS, nameOf } from "./model";
import { SEATS, seatFills } from "./SeatBoard";

export const IMG_W = 1080;
export const IMG_H = 1350;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const rgb = (name: string) => `rgb(${cssVar(name)})`;
const font = (name: string, fallback: string) => `${cssVar(name) || fallback}, system-ui, sans-serif`;

export interface ShareImageInput {
  values: Record<string, number>;
  pct?: Record<string, number>;
  username?: string;
  /** גושים, אם נקבע להם יעד: שם וסכום מנדטים (src/pages/guess/blocSummary.ts) */
  blocs?: BlocTotal[];
}

export async function renderShareImage({ values, pct, username, blocs }: ShareImageInput): Promise<Blob> {
  const board = document.documentElement.dataset.theme === "board";
  const c = {
    bg: rgb(board ? "--frame" : "--paper"),
    card: rgb(board ? "--frame" : "--card"),
    ink: rgb(board ? "--frame-ink" : "--ink"),
    soft: rgb(board ? "--frame-soft" : "--ink-soft"),
    line: rgb(board ? "--frame-line" : "--line"),
    signal: rgb("--signal"),
  };
  const display = font("--font-display", "sans-serif");
  const body = font("--font-body", "sans-serif");
  const num = font("--font-num", "sans-serif");
  try {
    await Promise.all([`700 80px ${display}`, `400 32px ${body}`, `700 32px ${body}`, `400 80px ${num}`].map((f) => document.fonts?.load(f)));
  } catch {
    /* גופן לא נטען — גופן המערכת */
  }

  const cv = document.createElement("canvas");
  cv.width = IMG_W;
  cv.height = IMG_H;
  const ctx = cv.getContext("2d")!;
  ctx.direction = "rtl";
  const R = IMG_W - 72; // קצה ימני לטקסט
  const L = 72;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, IMG_W, IMG_H);
  // פס עליון דק בצבע ההדגשה
  ctx.fillStyle = c.signal;
  ctx.fillRect(0, 0, IMG_W, 14);

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.ink;
  ctx.font = `700 92px ${display}`;
  ctx.fillText(username ? `הכנסת של ${username}` : "הכנסת שלי", R, 140);
  ctx.fillStyle = c.soft;
  ctx.font = `400 34px ${body}`;
  ctx.fillText(pct ? "השערה לבחירות לכנסת ה-26 · לפי אחוזי הצבעה, מחושב לפי החוק" : "השערה לבחירות לכנסת ה-26 · השערה, לא סקר", R, 196);

  // שורת הגושים (אם יש): "גוש א 61 · גוש ב 59" — בולט וקריא גם כשמצמצמים את התמונה
  if (blocs?.length) {
    const line = blocs.map((b) => `${b.name} ${b.total}`).join("  ·  ");
    let bs = 44;
    do ctx.font = `700 ${bs}px ${body}`;
    while (ctx.measureText(line).width > R - L && --bs > 26);
    ctx.fillStyle = c.ink;
    ctx.fillText(line, R, 256);
  }

  // חצי העיגול — אותם מיקומים כמו בלוח שבאתר (viewBox ‏2.2×1.12)
  const { order, fills } = seatFills(values);
  const scale = (IMG_W - 2 * L) / 2.2;
  const top = blocs?.length ? 290 : 236;
  SEATS.forEach((s, k) => {
    const f = fills[k];
    ctx.beginPath();
    ctx.arc(L + s.x * scale, top + s.y * scale, 0.038 * scale, 0, Math.PI * 2);
    ctx.fillStyle = f ? colorOf(f.id, f.i) : c.line;
    ctx.fill();
  });
  const total = order.reduce((a, id) => a + values[id], 0);
  ctx.textAlign = "center";
  ctx.fillStyle = board ? c.signal : c.ink;
  ctx.font = `400 150px ${num}`;
  ctx.fillText(String(total), IMG_W / 2, top + 1.07 * scale - 10);

  // הרשימות, מהגדולה: שתי עמודות
  const rows = order.slice(0, 12);
  const y0 = top + 1.12 * scale + 70;
  const colW = (IMG_W - 2 * L - 40) / 2;
  const rowH = blocs?.length ? 56 : 62;
  rows.forEach((id, i) => {
    const col = Math.floor(i / 6);
    const y = y0 + (i % 6) * rowH;
    const right = R - col * (colW + 40);
    const left = right - colW;
    ctx.beginPath();
    ctx.arc(right - 12, y - 12, 12, 0, Math.PI * 2);
    ctx.fillStyle = colorOf(id, IDS.indexOf(id));
    ctx.fill();
    ctx.textAlign = "right";
    ctx.fillStyle = c.ink;
    ctx.font = `700 34px ${body}`;
    let name = nameOf(id);
    while (ctx.measureText(name).width > colW - 150 && name.length > 3) name = name.slice(0, -2) + "…";
    ctx.fillText(name, right - 36, y);
    ctx.textAlign = "left";
    ctx.font = `700 46px ${num}`;
    ctx.fillStyle = board ? c.signal : c.ink;
    ctx.fillText(String(values[id]), left, y);
    if (pct) {
      ctx.font = `700 28px ${body}`;
      ctx.fillStyle = c.ink;
      ctx.fillText(`${pct[id] ?? 0}%`, left + 66, y);
    }
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, y + 20);
    ctx.lineTo(right, y + 20);
    ctx.stroke();
  });
  if (order.length > rows.length) {
    ctx.textAlign = "right";
    ctx.fillStyle = c.ink;
    ctx.font = `400 28px ${body}`;
    ctx.fillText(`ועוד ${order.length - rows.length} רשימות`, R, y0 + 6 * rowH - 6);
  }

  // תחתית: קריאה לפעולה + כתובת
  ctx.fillStyle = c.card === c.bg ? c.line : c.card;
  ctx.fillRect(0, IMG_H - 176, IMG_W, 176);
  ctx.textAlign = "right";
  ctx.fillStyle = c.ink;
  const cta = "ומה אתם מנחשים? בנו את הכנסת שלכם";
  let size = 64;
  do ctx.font = `700 ${size}px ${display}`;
  while (ctx.measureText(cta).width > R - L && --size > 30);
  ctx.fillText(cta, R, IMG_H - 100);
  ctx.fillStyle = c.soft;
  ctx.font = `700 34px ${body}`;
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillText(SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, ""), R, IMG_H - 48);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}
