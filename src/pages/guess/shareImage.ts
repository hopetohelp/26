/**
 * תמונת שיתוף להשערה (PNG, רוחב 1080 וגובה 1350 ומעלה): בחירה בין תמונת מפלגות לתמונת גושים עם ההשערה, ממוצע הסקרים והתחזית.
 * הצבעים נקראים ממשתני ה-CSS של העיצוב הפעיל (בהיר/חשוך, מקצועי/חדשותי) — אין כאן צבע קבוע, מלבד צבעי הרשימות
 * הניטרליים מ-src/lib/colors.ts. הטקסט מימין לשמאל. בלי המלצה ובלי אימוג'י.
 */
import { formatBlocValue } from "../../lib/personalBlocs";
import { colorOf } from "../../lib/colors";
import { SITE_URL } from "../../lib/shareGuess";
import { type BlocTotal } from "./blocSummary";
import { IDS, nameOf } from "./model";
import { dateLong, seatsFmt } from "../../lib/format";
import { shareBlocRows, SHARE_POLLS, SHARE_POLLS_AS_OF, SHARE_FORECAST_AS_OF, SHARE_FORECAST_CAUTION } from "./shareComparison";
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
  kind?: "parties" | "blocs";
  pct?: Record<string, number>;
  username?: string;
  /** תרחישים עצמאיים: שם, סכום מנדטים והרכב המפלגות (src/pages/guess/blocSummary.ts) */
  blocs?: BlocTotal[];
}

export async function renderShareImage({ values, pct, username, blocs, kind = blocs?.length ? "blocs" : "parties" }: ShareImageInput): Promise<Blob> {
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
    await Promise.all([`800 80px ${display}`, `700 80px ${display}`, `400 32px ${body}`, `700 32px ${body}`, `700 80px ${num}`].map((f) => document.fonts?.load(f, "אבג 0123456789")));
  } catch {
    /* גופן לא נטען — גופן המערכת */
  }

  if (kind === "blocs") {
    if (!blocs?.length) throw new Error("no blocs");
    const cv = document.createElement("canvas");
    cv.width = IMG_W;
    const ctx = cv.getContext("2d")!;
    const R = IMG_W - 72, L = 72;
    const wrap = (text: string, max: number) => {
      const lines: string[] = [];
      for (const word of text.split(" ")) {
        const last = lines.length - 1;
        if (last < 0 || ctx.measureText(`${lines[last]} ${word}`).width > max) lines.push(word);
        else lines[last] += ` ${word}`;
      }
      return lines;
    };
    ctx.font = `400 30px ${body}`;
    const rows = shareBlocRows(blocs, values).map(b => {
      const incomplete = [["ההשערה שלי",b.mineInfo],["ממוצע סקרים",b.pollsInfo],["תחזית",b.forecastInfo]] as const;
      const notes = incomplete.filter(([,info])=>info.missing.length).flatMap(([label,info])=>wrap(`${label}: נתון ל-${info.knownCount}/${info.lists.length} מפלגות; חסר: ${info.missing.map(nameOf).join(" · ")}`,R-L));
      return {...b,names:wrap(b.lists.map(nameOf).join(" · "),R-L),notes};
    });
    const imageHeight = Math.max(IMG_H, 380 + rows.reduce((n, row) => n + 172 + (row.names.length + row.notes.length) * 38, 0) + 290);
    cv.height = imageHeight;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, IMG_W, imageHeight);
    ctx.fillStyle = c.signal;
    ctx.fillRect(0, 0, IMG_W, 14);
    ctx.fillStyle = c.ink;
    ctx.font = `700 80px ${display}`;
    ctx.fillText(username ? `הגושים של ${username}` : "הגושים שלי", R, 140, R - L);
    ctx.fillStyle = c.soft;
    ctx.font = `400 30px ${body}`;
    ctx.fillText("השערה, לא סקר · אותם הרכבי מפלגות בשלוש השוואות", R, 200, R - L);
    ctx.font = `400 26px ${body}`;
    ctx.fillText(`ממוצע סקרים: ${dateLong(SHARE_POLLS_AS_OF)} · תחזית: ${dateLong(SHARE_FORECAST_AS_OF)}`, R, 247, R - L);
    const columns = [R - 145, IMG_W / 2, L + 145];
    ctx.textAlign = "center";
    ctx.font = `700 32px ${body}`;
    ["ההשערה שלי", "ממוצע סקרים", "תחזית"].forEach((label, i) => ctx.fillText(label, columns[i], 312));
    let y = 382;
    rows.forEach(row => {
      ctx.textAlign = "right";
      ctx.fillStyle = c.ink;
      ctx.font = `700 44px ${display}`;
      ctx.fillText(row.name, R, y, R - L);
      ctx.textAlign = "center";
      ctx.font = `700 60px ${num}`;
      [row.mineInfo, row.pollsInfo, row.forecastInfo].forEach((info, i) => {
        ctx.fillStyle = i === 0 && board ? c.signal : c.ink;
        ctx.fillText(formatBlocValue(info), columns[i], y + 72, 285);
      });
      ctx.textAlign = "right";
      ctx.fillStyle = c.soft;
      ctx.font = `400 30px ${body}`;
      row.names.forEach((line, i) => ctx.fillText(line, R, y + 126 + i * 38));
      row.notes.forEach((line,i)=>ctx.fillText(line,R,y+126+(row.names.length+i)*38));
      y += 172 + (row.names.length + row.notes.length) * 38;
      ctx.strokeStyle = c.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L, y - 48); ctx.lineTo(R, y - 48); ctx.stroke();
    });
    ctx.textAlign = "right";
    ctx.fillStyle = c.soft;
    ctx.font = `400 26px ${body}`;
    ctx.fillText("גושים חופפים; אין לחברם. לפחות = חלקי · כ- = אומדן · — = אין נתון.", R, imageHeight - 245, R - L);
    if (SHARE_FORECAST_CAUTION) ctx.fillText("התחזית לא עברה את רף הדיוק שנקבע בבדיקת העבר.", R, imageHeight - 208, R - L);
    ctx.fillStyle = c.line;
    ctx.fillRect(0, imageHeight - 176, IMG_W, 176);
    ctx.fillStyle = c.ink;
    ctx.font = `700 54px ${display}`;
    ctx.fillText("ומה אתם מנחשים? בנו את הכנסת שלכם", R, imageHeight - 100, R - L);
    ctx.fillStyle = c.soft;
    ctx.font = `700 34px ${body}`;
    ctx.direction = "ltr";
    ctx.fillText(SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, ""), R, imageHeight - 48);
    return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/png"));
  }

  const cv = document.createElement("canvas");
  cv.width = IMG_W;
  const imageHeight = IMG_H + 180;
  cv.height = imageHeight;
  const ctx = cv.getContext("2d")!;
  ctx.direction = "rtl";
  const R = IMG_W - 72; // קצה ימני לטקסט
  const L = 72;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, IMG_W, imageHeight);
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

  // חצי העיגול — אותם מיקומים כמו בלוח שבאתר (viewBox ‏2.2×1.12)
  const { order, fills } = seatFills(values);
  const scale = (IMG_W - 2 * L) / 2.2;
  const top = 236;
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
  ctx.font = `700 150px ${num}`;
  ctx.fillText(String(total), IMG_W / 2, top + 1.07 * scale - 10);

  // הרשימות, מהגדולה: שתי עמודות
  const rows = order.slice(0, 12);
  const y0 = top + 1.12 * scale + 70;
  const colW = (IMG_W - 2 * L - 40) / 2;
  const rowH = 86;
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
    ctx.textAlign = "right";
    ctx.font = `400 26px ${body}`;
    ctx.fillStyle = c.soft;
    ctx.fillText(`ממוצע סקרים: ${SHARE_POLLS[id] === undefined ? "—" : seatsFmt(SHARE_POLLS[id])}`, right - 36, y + 30);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, y + 46);
    ctx.lineTo(right, y + 46);
    ctx.stroke();
  });
  if (order.length > rows.length) {
    ctx.textAlign = "right";
    ctx.fillStyle = c.ink;
    ctx.font = `400 28px ${body}`;
    ctx.fillText(`ועוד ${order.length - rows.length} רשימות`, R, y0 + 6 * rowH - 6);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = c.soft;
  ctx.font = `400 26px ${body}`;
  ctx.fillText(`ממוצע הסקרים האחרון נכון ל-${dateLong(SHARE_POLLS_AS_OF)}`, R, imageHeight - 208);

  // תחתית: קריאה לפעולה + כתובת
  ctx.fillStyle = c.card === c.bg ? c.line : c.card;
  ctx.fillRect(0, imageHeight - 176, IMG_W, 176);
  ctx.textAlign = "right";
  ctx.fillStyle = c.ink;
  const cta = "ומה אתם מנחשים? בנו את הכנסת שלכם";
  let size = 64;
  do ctx.font = `700 ${size}px ${display}`;
  while (ctx.measureText(cta).width > R - L && --size > 30);
  ctx.fillText(cta, R, imageHeight - 100);
  ctx.fillStyle = c.soft;
  ctx.font = `700 34px ${body}`;
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillText(SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, ""), R, imageHeight - 48);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}
