import { resolveDataset, type Selection } from "../../lib/dataResolver";
import { DATA_PRODUCTS } from "../../lib/dataCatalog";
/**
 * תמונת שיתוף להשערה (PNG, רוחב 1080 וגובה 1350 ומעלה): בחירה בין תמונת מפלגות לתמונת גושים עם ההשערה, ממוצע הסקרים והתחזית.
 * הצבעים נקראים ממשתני ה-CSS של העיצוב הפעיל (בהיר/חשוך) — אין כאן צבע קבוע, מלבד צבעי הרשימות
 * הניטרליים מ-src/lib/colors.ts. הטקסט מימין לשמאל. בלי המלצה ובלי אימוג'י.
 */
import { formatBlocValue } from "../../lib/personalBlocs";
import { colorOf } from "../../lib/colors";
import { SITE_URL } from "../../lib/shareGuess";
import { type BlocTotal } from "./blocSummary";
import { IDS, nameOf } from "./model";
import { date, seatsFmt } from "../../lib/format";
import { shareBlocRows, SHARE_POLLS_AS_OF, SHARE_FORECAST_AS_OF, SHARE_FORECAST_CAUTION } from "./shareComparison";
import { HALL } from "../../lib/hemicycle";
import { SEATS, seatFills } from "./SeatBoard";

export const IMG_W = 1080;
export const IMG_H = 1350;

/** מקום הלוגו של קבוצה בפינה השמאלית העליונה: ריבוע של LOGO_BOX נקודות, והטקסט לידו מצטמצם בהתאם */
export const LOGO_BOX = 140;
export function drawLogo(ctx: CanvasRenderingContext2D, logo: ImageBitmap, x: number, y: number, size: number) {
  const k = Math.min(size / logo.width, size / logo.height);
  const w = logo.width * k, h = logo.height * k;
  ctx.drawImage(logo, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

/** כתובת בתוך ציור מימין לשמאל: בלי בידוד הכיוון המספר ("26") עובר לסוף ויוצא "hopetohelp.net.26" */
// סימן שמאל־לימין (LRM) ולא בידוד (LRI): Safari באייפון מתעלם מבידוד בציור, ו-LRM עובד בכל הדפדפנים
export const ltrText = (text: string) => `\u200E${text}\u200E`;
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const rgb = (name: string) => `rgb(${cssVar(name)})`;
const font = (name: string, fallback: string) => `${cssVar(name) || fallback}, system-ui, sans-serif`;

export interface ShareImageInput {
  selection?: Selection;
  values: Record<string, number>;
  kind?: "parties" | "blocs";
  pct?: Record<string, number>;
  username?: string;
  /** תרחישים עצמאיים: שם, סכום מנדטים והרכב המפלגות (src/pages/guess/blocSummary.ts) */
  blocs?: BlocTotal[];
  /** תמונה של מקור אחר (למשל ממוצע סקר האתר): כותרות, ערך מוצג לכל רשימה וקריאה לפעולה */
  labels?: { title: string; subtitle: string; cta: string; value?: (id: string) => string; /** קבוצה (הכרעת בעלים, 12/10): לוגו בפינה השמאלית העליונה, וכתובת הקבוצה בתחתית במקום כתובת האתר */ logo?: ImageBitmap | null; address?: string };
}

/** צבעי העיצוב הפעיל וגופניו — לכל תמונות השיתוף */
export async function sharePalette() {
  const c = { bg: rgb("--paper"), card: rgb("--card"), ink: rgb("--ink"), soft: rgb("--ink-soft"), line: rgb("--line"), signal: rgb("--signal") };
  const f = { display: font("--font-display", "sans-serif"), body: font("--font-body", "sans-serif"), num: font("--font-num", "sans-serif") };
  try {
    await Promise.all([`800 80px ${f.display}`, `700 80px ${f.display}`, `400 32px ${f.body}`, `700 32px ${f.body}`, `700 80px ${f.num}`].map((x) => document.fonts?.load(x, "אבג 0123456789")));
  } catch {
    /* גופן לא נטען — גופן המערכת */
  }
  return { c, ...f };
}

export async function renderShareImage({ values, pct, username, blocs, labels, selection = { product: "polls.mean" }, kind = blocs?.length ? "blocs" : "parties" }: ShareImageInput): Promise<Blob> {
  const dataset = resolveDataset(selection, "guess");
  const SHARE_POLLS = dataset.seats;
  const sourceName = dataset.rows[0]?.label ?? DATA_PRODUCTS[selection.product].name;
  const c = {
    bg: rgb("--paper"),
    card: rgb("--card"),
    ink: rgb("--ink"),
    soft: rgb("--ink-soft"),
    line: rgb("--line"),
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
    const rows = shareBlocRows(blocs, values, SHARE_POLLS, undefined, selection).map(b => {
      return {...b,names:wrap(b.lists.map(nameOf).join(" · "),R-L)};
    });
    const imageHeight = Math.max(IMG_H, 380 + rows.reduce((n, row) => n + 172 + row.names.length * 38, 0) + 290);
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
    ctx.fillText("ניחוש, לא סקר · אותם הרכבי מפלגות בשלוש השוואות", R, 200, R - L);
    ctx.font = `400 26px ${body}`;
    ctx.fillText(`${sourceName}: ${date(SHARE_POLLS_AS_OF)} · מודל המגמות: ${date(SHARE_FORECAST_AS_OF)}`, R, 247, R - L);
    const columns = [R - 145, IMG_W / 2, L + 145];
    ctx.textAlign = "center";
    ctx.font = `700 32px ${body}`;
    ["הניחוש שלי", sourceName, "מודל המגמות"].forEach((label, i) => ctx.fillText(label, columns[i], 312));
    let y = 382;
    rows.forEach(row => {
      ctx.textAlign = "right";
      ctx.fillStyle = c.ink;
      ctx.font = `700 44px ${display}`;
      ctx.fillText(row.name, R, y, R - L);
      ctx.textAlign = "center";
      ctx.font = `700 60px ${num}`;
      [row.mineInfo, row.pollsInfo, row.forecastInfo].forEach((info, i) => {
        ctx.fillStyle = c.ink;
        ctx.fillText(formatBlocValue(info), columns[i], y + 72, 285);
      });
      ctx.textAlign = "right";
      ctx.fillStyle = c.soft;
      ctx.font = `400 30px ${body}`;
      row.names.forEach((line, i) => ctx.fillText(line, R, y + 126 + i * 38));
      y += 172 + row.names.length * 38;
      ctx.strokeStyle = c.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L, y - 48); ctx.lineTo(R, y - 48); ctx.stroke();
    });
    ctx.textAlign = "right";
    ctx.fillStyle = c.soft;
    ctx.font = `400 26px ${body}`;
    ctx.fillText("גושים חופפים; אין לחברם. מפלגה בלי נתון נספרת 0 · — = אין נתון.", R, imageHeight - 245, R - L);
    if (SHARE_FORECAST_CAUTION) ctx.fillText("מודל המגמות לא עבר את רף הדיוק שנקבע בבדיקת העבר.", R, imageHeight - 208, R - L);
    ctx.fillStyle = c.line;
    ctx.fillRect(0, imageHeight - 176, IMG_W, 176);
    ctx.fillStyle = c.ink;
    ctx.font = `700 54px ${display}`;
    ctx.fillText("ומה אתם משערים? בנו את הכנסת שלכם", R, imageHeight - 100, R - L);
    ctx.fillStyle = c.soft;
    ctx.font = `700 34px ${body}`;
    ctx.direction = "ltr";
    ctx.fillText(ltrText(SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, "")), R, imageHeight - 48);
    return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/png"));
  }

  const cv = document.createElement("canvas");
  cv.width = IMG_W;
  // הפרסה גבוהה מחצי העיגול שהיה: הלוח ברוחב 60% מהתמונה, והתמונה גבוהה בהתאם
  const boardScale = ((IMG_W - 144) * 0.6) / HALL.w;
  const boardH = HALL.h * boardScale;
  const imageHeight = IMG_H + 180 + Math.max(0, Math.round(boardH - (1.12 * (IMG_W - 144)) / 2.2));
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
  const logoRoom = labels?.logo ? LOGO_BOX + 30 : 0;
  if (labels?.logo) drawLogo(ctx, labels.logo, L, 44, LOGO_BOX);
  ctx.fillText(labels?.title ?? (username ? `הכנסת של ${username}` : "הניחוש שלי"), R, 140, R - L - logoRoom);
  ctx.fillStyle = c.soft;
  ctx.font = `400 34px ${body}`;
  ctx.fillText(labels?.subtitle ?? (pct ? "ניחוש לבחירות לכנסת ה-26 · לפי אחוזי הצבעה, מחושב לפי החוק" : "ניחוש לבחירות לכנסת ה-26 · ניחוש, לא סקר"), R, 196, R - L - logoRoom);

  // הפרסה — אותם מיקומים כמו בלוח שבאתר (`HALL`), במרכז התמונה
  const { order, fills } = seatFills(values);
  const scale = boardScale;
  const left0 = (IMG_W - HALL.w * scale) / 2;
  const top = 236;
  SEATS.forEach((s, k) => {
    const f = fills[k];
    ctx.beginPath();
    ctx.arc(left0 + s.x * scale, top + s.y * scale, HALL.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = f ? colorOf(f.id, f.i) : c.line;
    ctx.fill();
  });
  const total = order.reduce((a, id) => a + values[id], 0);
  ctx.textAlign = "center";
  ctx.fillStyle = c.ink;
  ctx.font = `700 150px ${num}`;
  ctx.fillText(String(total), IMG_W / 2, top + HALL.cy * scale + 54);

  // הרשימות, מהגדולה: שתי עמודות
  const rows = order.slice(0, 12);
  const y0 = top + boardH + 70;
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
    ctx.fillStyle = c.ink;
    ctx.fillText(labels?.value?.(id) ?? String(values[id]), left, y);
    if (pct) {
      ctx.font = `700 28px ${body}`;
      ctx.fillStyle = c.ink;
      ctx.fillText(`${pct[id] ?? 0}%`, left + 66, y);
    }
    ctx.textAlign = "right";
    ctx.font = `400 26px ${body}`;
    ctx.fillStyle = c.soft;
    ctx.fillText(`${sourceName}: ${SHARE_POLLS[id] === undefined ? "—" : seatsFmt(SHARE_POLLS[id])}`, right - 36, y + 30);
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
  ctx.fillText(`${sourceName} נכון ל-${date(SHARE_POLLS_AS_OF)}`, R, imageHeight - 208);

  // תחתית: קריאה לפעולה + כתובת
  ctx.fillStyle = c.card === c.bg ? c.line : c.card;
  ctx.fillRect(0, imageHeight - 176, IMG_W, 176);
  ctx.textAlign = "right";
  ctx.fillStyle = c.ink;
  const cta = labels?.cta ?? "ומה אתם משערים? בנו את הכנסת שלכם";
  let size = 64;
  do ctx.font = `700 ${size}px ${display}`;
  while (ctx.measureText(cta).width > R - L && --size > 30);
  ctx.fillText(cta, R, imageHeight - 100);
  ctx.fillStyle = c.soft;
  ctx.font = `700 34px ${body}`;
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillText(ltrText(labels?.address ?? SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, "")), R, imageHeight - 48);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}
