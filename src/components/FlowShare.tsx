import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SITE_URL } from "../lib/shareGuess";
import { sharePalette, IMG_W, ltrText, drawQr, QR_SIZE } from "../pages/guess/shareImage";
import { BLOC_COLORS, THEMES } from "../lib/promoVideo";
import { results2026 } from "../lib/guessAccuracyData";
import { DEFAULT_LINEAGE } from "../lib/lineage";
import { loadLogo } from "../pages/guess/communityShare";
import { useHagzara } from "../pages/simple/hagzara";
import { useSession } from "../pages/guess/useCrowd";
import { countImage } from "../lib/visits";
import { BLOC_IDS, bloc2022, bloc2026, blocsOf, cameFromGroup, flow, flowsFor, groupChange, newName, oldName, partialLine, smallPct, wentToGroup, type FlowRow, type Mode } from "../lib/voterFlow";
import { sumBallotVotes, validBallotVotes, type BallotUnits as Units } from "../lib/ballotLookup";

type Who = "all" | "haredi" | "party";
type Where = "country" | "city";
type Dir = "from" | "to";

const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const ENVELOPES = "9999";
/** חלק קטן מ-3% לא מוצג בתמונה, כדי שתישאר קריאה */
const MIN_SHARE = 3;
/** "השינוי הגדול ביותר" — רק בעיר שיש בה לפחות 5% מהמצביעים של המפלגה (הכרעת בעלים 28.10.2026) */
const MIN_CITY_SHARE = 0.05;
/** גובה התמונה שאליו ממלאים ערים בולטות (לפחות עיר אחת) */
const TARGET_H = 1350;
/** "חרדים": ש"ס ויהדות התורה, כל אחת בנפרד (הכרעת בעלים 28.10.2026) */
const HAREDI = ["shas", "utj"];
/** הרשימות הקטנות — מוצגות החל מ-0.1%, כמו במסך (הכרעת בעלים 28.10.2026) */
const SMALL = new Set(["reservists", "amcha", "code_black", "haredi_public", "noam"]);
/** "לאן הלכו" בכל המפלגות: רשימות 2022 שעברו את אחוז החסימה */
const K25_PASSED = ["מחל", "פה", "ט", "כן", "שס", "ג", "ל", "עם", "ום", "אמת"];
const LETTER_OF = Object.fromEntries(Object.entries(flow.letters26).map(([l, id]) => [id, l]));
const seats = (id: string) => results2026.seats[id] ?? 0;
const prevOf = (id: string) => DEFAULT_LINEAGE.map[id] ?? [];

interface CityShare { code: string; name: string; votes: number; share26: number; share22: number | null }
/** אחוז הקבוצה בכל יישוב: 2026 — הרשימות עצמן; 2022 — הרשימות שקדמו להן לפי השיוך של האתר (raw/lineage.json); בלי קודמת — אין השוואה */
function cityShares(u: Units, ids: string[]): CityShare[] {
  const l26 = ids.map((id) => u.letters26.indexOf(LETTER_OF[id])).filter((k) => k >= 0);
  const l22 = [...new Set(ids.flatMap(prevOf))].map((l) => u.letters22.indexOf(l)).filter((k) => k >= 0);
  return Object.entries(u.places).filter(([code, p]) => code !== ENVELOPES && p.y26.length).map(([code, p]) => {
    const v26 = validBallotVotes(p.y26, u.letters26.length), v22 = validBallotVotes(p.y22, u.letters22.length), votes = sumBallotVotes(p.y26, l26);
    return { code, name: p.name, votes, share26: v26 ? (votes / v26) * 100 : 0, share22: l22.length && v22 ? (sumBallotVotes(p.y22, l22) / v22) * 100 : null };
  });
}
/** ערים עם לפחות 5% ממצביעי המפלגה; מפלגה שמצביעיה מפוזרים ואין לה עיר כזו (הליכוד) — חמש הערים עם הכי הרבה מצביעים שלה */
function eligible(all: CityShare[]): CityShare[] {
  const total = all.reduce((a, c) => a + c.votes, 0), hit = all.filter((c) => c.votes >= total * MIN_CITY_SHARE);
  return hit.length ? hit : [...all].sort((a, b) => b.votes - a.votes).slice(0, 5);
}
const delta = (c: CityShare) => Math.abs(c.share26 - (c.share22 ?? c.share26));
function biggestChange(all: CityShare[]): CityShare | undefined {
  return eligible(all).filter((c) => c.share22 !== null).sort((a, b) => delta(b) - delta(a))[0];
}
/** ערים בולטות: n הערים עם האחוז הגבוה ביותר לקבוצה, מבין הערים שיש בהן לפחות 5% ממצביעיה (הכרעת בעלים) */
function topCities(all: CityShare[], n: number): CityShare[] {
  return eligible(all).sort((a, b) => b.share26 - a.share26).slice(0, n);
}

interface Spec { logo?: ImageBitmap | null; who: Who; party: string; where: Where; city: string; dir: Dir; blocs: boolean; mode: Mode }

/** תמונת השיתוף בגווני הגזרה: רקע כהה עם הילות כחול ואדום, מסגרת מעוגלת, כרטיסים רכים; אחוזים בלבד */
async function render(spec: Spec, units: Units | null): Promise<Blob> {
  const { display, body, num } = await sharePalette();
  const P = THEMES.hagzara;
  const blocColor = (b: string) => BLOC_COLORS[b] ?? "rgba(255,255,255,.28)";
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = 4000;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  const R = IMG_W - 90, L = 90, CW = R - L;
  const ids = spec.who === "haredi" ? HAREDI : spec.who === "party" ? [spec.party] : [];
  const national = flow.modes[spec.mode].flows, nationalTo = flow.modes[spec.mode].flowsTo;
  const place = spec.who === "all" && spec.where === "city" && units ? Object.entries(units.places).find(([, p]) => p.name === spec.city.trim()) : undefined;
  const cityData = place ? (flow as unknown as { cities?: Record<string, { flows: number[][]; flowsTo?: number[][] }> }).cities?.[place[0]] : undefined;
  const matrix = spec.who === "all" && spec.where === "city" ? cityData?.flows ?? null : national;
  const matrixTo = spec.who === "all" && spec.where === "city" ? cityData?.flowsTo ?? cityData?.flows ?? null : nationalTo;
  const card = (x: number, yy: number, w: number, h: number, stroke?: string) => {
    ctx.fillStyle = P.card; ctx.beginPath(); ctx.roundRect(x, yy, w, h, 28); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); }
  };
  const pill = (x: number, yy: number, w: number, h: number, color: string) => { if (w < 1) return; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, yy, w, h, h / 2); ctx.fill(); };
  // מדיניות האחוזים של המסך גם בתמונה (הכרעת בעלים 28.10.2026): מתחת ל-2% — עשירית; בדיוק אחוז ⇐ "1%"
  const pct = (v: number) => ltrText(`${smallPct(v) ?? "0"}%`);
  const minor = smallPct;
  const fit = (t: string, w: number) => { let n = t; while (ctx.measureText(n).width > w && n.length > 3) n = n.slice(0, -2) + "…"; return n; };
  let y = 120;
  const heading = (t: string) => { ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `800 40px ${display}`; ctx.fillText(t, R, y + 10); y += 62; };

  // כותרת
  ctx.textAlign = "center"; ctx.fillStyle = P.ink; ctx.font = `800 62px ${display}`;
  const title = spec.who === "all" ? (spec.dir === "from" ? "מי הגיע מאיפה?" : "לאן הלכו המצביעים?") : spec.who === "haredi" ? "מאיפה הגיעו מצביעי המפלגות החרדיות?" : `מאיפה הגיעו המצביעים של ${newName(ids[0])}?`;
  for (const line of wrap(ctx, title, CW)) { ctx.fillText(line, IMG_W / 2, y); y += 76; }
  const where = spec.who === "all" && spec.where === "city" ? place?.[1].name ?? spec.city : "כל הארץ";
  ctx.fillStyle = P.soft; ctx.font = `500 32px ${body}`; ctx.fillText(`${where} · 2022 מול 2026`, IMG_W / 2, y); y += 56;
  ctx.font = `500 26px ${body}`; const pl = partialLine(), pw = ctx.measureText(pl).width + 48;
  pill(IMG_W / 2 - pw / 2, y - 22, pw, 44, P.faint); ctx.fillStyle = P.ink; ctx.fillText(pl, IMG_W / 2, y); y += 70;

  /** כרטיס מפלגה (שם המפלגה פעם אחת — בכותרת התמונה, או בכותרת הטור בחרדים; הכרעת בעלים 28/10): מנדטים, מאיפה הגיעו (חלק מרכזי) ולאן הלכו מצביעי הקודמת ב-2022 (חלק משני) */
  const seatsAt = (id: string, x: number, yy: number) => {
    ctx.textAlign = "left"; ctx.fillStyle = P.ink; ctx.font = `800 40px ${num}`; const st = ltrText(String(seats(id))); ctx.fillText(st, x, yy);
    const sw = ctx.measureText(st).width; ctx.fillStyle = P.soft; ctx.font = `500 24px ${body}`; ctx.fillText("מנדטים", x + sw + 10, yy + 4);
  };
  const partyRows = (id: string, maxRows: number) => cameFromGroup(national, [id]).filter((p) => p.share >= (maxRows < 5 ? 1 : MIN_SHARE) || (SMALL.has(p.id) && smallPct(p.share) !== null)).slice(0, maxRows).length;
  /** `slots`: מספר שורות "מאיפה הגיעו" שנשמר בכרטיס — בשני כרטיסים זה לצד זה, "לאן הלכו" מתחיל באותו קו בשניהם; `minH`: גובה אחיד */
  const partyCard = (id: string, x: number, w: number, maxRows: number, slots = 0, minH = 0) => {
    const from = cameFromGroup(national, [id]).filter((p) => p.share >= (maxRows < 5 ? 1 : MIN_SHARE) || (SMALL.has(p.id) && smallPct(p.share) !== null)).slice(0, maxRows);
    const prev = prevOf(id), to = prev.length ? wentToGroup(nationalTo, prev).filter((p) => p.share >= 1 || (SMALL.has(p.id) && smallPct(p.share) !== null)).slice(0, 3) : []; // עד 3 תגיות (הכרעת בעלים)
    const narrow = w < CW;
    /** אותה מפלגה בשתי הבחירות (אותו שם; לא רשימה שהחליפה שם, כמו המחנה הממלכתי ⇐ ישר!) — בלי לחזור על השם */
    const same = (letters: string | undefined) => !!letters && prev.includes(letters) && oldName(letters) === newName(id);
    // שורות התגיות: בכרטיס צר — תגית בשורה; ברחב — לפי הרוחב
    ctx.font = `600 26px ${body}`;
    let tagRows = 0, rowW = 0;
    for (const p of to) { const tw = ctx.measureText(`${p.id === id && same(prev[0]) ? "נשארו" : p.name} ${minor(p.share) ?? ""}%`).width + 44; if (narrow || !tagRows || rowW + tw > w - 72) { tagRows++; rowW = tw; } else rowW += tw; }
    const fromN = Math.max(from.length, slots);
    const o = narrow ? 80 : 112; // בכרטיס הרחב יש שורת מנדטים מעל השורות
    const h = Math.max(minH, o + 2 + fromN * 92 + (to.length ? 70 + tagRows * 58 : 0));
    card(x, y, w, h);
    const xr = x + w - 36, xl = x + 36;
    // בכרטיס הרחב — המנדטים בשורת הכותרת; בטורים (חרדים) הם בכותרת הטור
    if (!narrow) seatsAt(id, xl, y + 54);
    let yy = y + o;
    ctx.textAlign = "right"; ctx.fillStyle = P.soft; ctx.font = `600 24px ${body}`; ctx.fillText("מאיפה הגיעו", xr, y + (narrow ? 50 : 86));
    for (const p of from) {
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `600 32px ${body}`; ctx.fillText(fit(same(p.id) ? "אותה מפלגה" : p.name, w - 200), xr, yy + 20);
      ctx.textAlign = "left"; ctx.font = `800 46px ${num}`; ctx.fillText(pct(p.share), xl, yy + 22);
      const W = w - 72; pill(xl, yy + 56, W, 10, P.track); pill(xr - W * p.share / 100, yy + 56, W * p.share / 100, 10, blocColor(bloc2022(p.id)));
      yy += 92;
    }
    if (to.length) {
      yy = y + o + fromN * 92 + 10; ctx.textAlign = "right"; ctx.fillStyle = P.soft; ctx.font = `600 24px ${body}`;
      ctx.fillText("לאן הלכו מצביעי 2022", xr, yy);
      // תגיות קטנות: יעד ואחוז — בשורה אחת, או בעמודה בכרטיס צר
      ctx.font = `600 26px ${body}`; let xx = xr, ty = yy + 26;
      for (const p of to) {
        const t = `${fit(p.id === id && same(prev[0]) ? "נשארו" : p.name, w - 170)} ${minor(p.share) ?? ""}%`, tw = ctx.measureText(t).width + 32;
        if (narrow) { pill(xr - tw, ty, tw, 46, P.faint); ctx.fillStyle = P.ink; ctx.textAlign = "center"; ctx.fillText(t, xr - tw / 2, ty + 24); ty += 56; continue; }
        if (xx - tw < xl) { xx = xr; ty += 58; }
        pill(xx - tw, ty, tw, 48, P.faint); ctx.fillStyle = P.ink; ctx.textAlign = "center"; ctx.fillText(t, xx - tw / 2, ty + 25); xx -= tw + 12;
      }
    }
    return y + h;
  };
  /** כל המפלגות: רשת כרטיסים — לכל רשימה המקור (או היעד) העיקרי באחוז גדול, והמשני בקטן */
  const grid = (rows: FlowRow[], stripOf: (id: string) => string, prefix: string, extra?: (r: FlowRow) => string) => {
    const gap = 24, w = (CW - gap) / 2, h = 170;
    rows.forEach((r, i) => {
      const col = i % 2, x = R - (col + 1) * w - col * gap, yy = y + Math.floor(i / 2) * (h + gap);
      const [a, b] = r.parts.filter((p) => p.id !== "abstain" && p.id !== "other");
      card(x, yy, w, h); pill(x + w - 30, yy + 28, 8, h - 56, blocColor(stripOf(r.id)));
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 32px ${body}`; ctx.fillText(fit(r.name, w - (extra ? 150 : 80)), x + w - 52, yy + 44);
      if (extra) {
        ctx.textAlign = "left"; ctx.font = `800 32px ${num}`; const t = ltrText(extra(r)); ctx.fillText(t, x + 28, yy + 44);
        const tw = ctx.measureText(t).width; ctx.fillStyle = P.soft; ctx.font = `500 20px ${body}`; ctx.fillText("מנד׳", x + 34 + tw, yy + 47);
      }
      ctx.textAlign = "right";
      if (a) {
        ctx.fillStyle = P.ink; ctx.font = `800 52px ${num}`; ctx.fillText(pct(a.share), x + w - 52, yy + 104);
        const nw = ctx.measureText(pct(a.share)).width;
        ctx.fillStyle = P.soft; ctx.font = `500 26px ${body}`; ctx.fillText(`${prefix}${a.name}`, x + w - 52 - nw - 14, yy + 108, w - nw - 90);
      }
      const bs = b ? minor(b.share) : null;
      if (b && bs) { ctx.fillStyle = P.soft; ctx.font = `500 24px ${body}`; ctx.fillText(`${bs}% ${prefix}${b.name}`, x + w - 52, yy + 146, w - 80); }
    });
    y += Math.ceil(rows.length / 2) * (h + gap) + 10;
  };
  const blocs = (m: number[][]) => {
    heading("מעבר בין הגושים");
    const b = blocsOf(m, m === national ? nationalTo : matrixTo ?? m), to = spec.who === "all" && spec.dir === "to";
    grid((to ? b.wentTo : b.cameFrom).filter((r) => BLOC_IDS.slice(0, 4).includes(r.id)), (id) => id, to ? "ל" : "מ");
  };
  const signed = (d: number, unit = "%") => `${d >= 0 ? "▲ +" : "▼ −"}${unit === "%" ? smallPct(Math.abs(d)) ?? "0" : Math.round(Math.abs(d)).toLocaleString("he-IL")}${unit}`;
  /** השינוי בכל הארץ (חלק מרכזי): באחוז ובמספר הקולות, ומתחתיו אז והיום; העיר עם השינוי הגדול ביותר — חלק משני בתחתית הכרטיס (הכרעת בעלים 28/10) */
  const changeCard = (id: string, x: number, w: number) => {
    const c = groupChange(national, nationalTo, [id], prevOf(id));
    const city = units ? biggestChange(cityShares(units, [id])) : undefined;
    // כרטיס רחב (מפלגה אחת): השינוי בגדול מימין, הקולות ואז והיום משמאל; כרטיס צר (חרדים): הכול בטור
    const wide = w >= CW, top = 0, main = wide ? 120 : 210, h = top + main + (city?.share22 != null ? 96 : 0);
    card(x, y, w, h);
    const xr = x + w - 36, xl = x + 36;
    ctx.textAlign = "right";
    const y0 = y + top;
    /** טקסט משני: מספר ואחריו מילה (מימין לשמאל), מיושר לימין או לשמאל */
    const numWord = (n: string, word: string, yy: number, right: boolean) => {
      ctx.font = `700 30px ${num}`; const nw = ctx.measureText(n).width; ctx.font = `500 26px ${body}`; const ww = ctx.measureText(word).width;
      const start = right ? xr : xl + nw + 10 + ww; // הקצה הימני של השורה
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 30px ${num}`; ctx.fillText(n, start, yy);
      ctx.fillStyle = P.soft; ctx.font = `500 26px ${body}`; ctx.fillText(word, start - nw - 10, yy + 2);
    };
    const thenNow = (t: string, yy: number) => { ctx.textAlign = wide ? "left" : "right"; ctx.fillStyle = P.soft; ctx.font = `600 24px ${num}`; ctx.fillText(ltrText(t), wide ? xl : xr, yy); };
    if (c.share22 !== null && c.votes22 !== null) {
      const d = c.share26 - c.share22;
      ctx.textAlign = "right"; ctx.fillStyle = d >= 0 ? P.blueHi : P.redHi; ctx.font = `800 56px ${num}`; ctx.fillText(ltrText(signed(d)), xr, wide ? y0 + 62 : y0 + 52);
      numWord(ltrText(`${c.votes26 >= c.votes22 ? "+" : "−"}${Math.round(Math.abs(c.votes26 - c.votes22)).toLocaleString("he-IL")}`), "קולות", wide ? y0 + 44 : y0 + 110, !wide);
      thenNow(`2022: ${smallPct(c.share22) ?? "0"}%  ·  2026: ${smallPct(c.share26) ?? "0"}%`, wide ? y0 + 88 : y0 + 160);
    } else {
      // רשימה בלי קודמת ב-2022: האחוז של היום ומספר הקולות
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `800 56px ${num}`; ctx.fillText(pct(c.share26), xr, wide ? y0 + 62 : y0 + 52);
      numWord(ltrText(Math.round(c.votes26).toLocaleString("he-IL")), "קולות", wide ? y0 + 44 : y0 + 110, !wide);
      thenNow("רשימה חדשה", wide ? y0 + 88 : y0 + 160);
    }
    if (city && city.share22 !== null) {
      const yy = y0 + main - 4; pill(xl, yy, w - 72, 2, P.track);
      ctx.textAlign = "right"; ctx.fillStyle = P.soft; ctx.font = `500 22px ${body}`; ctx.fillText("השינוי הגדול ביותר", xr, yy + 30);
      const d = city.share26 - city.share22;
      ctx.fillStyle = P.ink; ctx.font = `700 28px ${body}`; ctx.fillText(fit(city.name, w - 220), xr, yy + 68);
      ctx.textAlign = "left"; ctx.fillStyle = d >= 0 ? P.blueHi : P.redHi; ctx.font = `800 30px ${num}`; ctx.fillText(ltrText(signed(d)), xl, yy + 68);
    }
    return y + h;
  };
  const changes = () => {
    heading("השינוי בכל הארץ");
    if (ids.length > 1) {
      const gap = 24, w = (CW - gap) / 2, top = y;
      const ends = ids.map((id, k) => { y = top; return changeCard(id, R - (k + 1) * w - k * gap, w); });
      y = Math.max(...ends) + 30;
    } else y = changeCard(ids[0], L, CW) + 30;
  };
  /** ערים בולטות (מפלגה אחת) — כמה שנכנס עד גובה התמונה; השינוי הגדול ביותר כבר בכרטיס של כל הארץ */
  const cities = () => {
    if (!units || ids.length > 1) return;
    const rowH = 118;
    // רק כשנכנסות לפחות שתי ערים — עיר אחת לבד מעמיסה וחוזרת על השינוי הגדול ביותר
    const n = Math.min(5, Math.floor((TARGET_H - (y + 62) - (QR_SIZE + 120)) / (rowH + 16)));
    if (n < 2) return;
    heading("ערים בולטות");
    topCities(cityShares(units, ids), n).forEach((c) => {
      card(L, y, CW, rowH);
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 38px ${body}`; ctx.fillText(c.name, R - 36, y + rowH / 2);
      // השינוי בגדול, ומתחתיו אז והיום; בלי קודמת ב-2022 — האחוז של היום בגדול
      const now = `2026: ${smallPct(c.share26) ?? "0"}%`;
      let big: string, color: string = P.ink;
      if (c.share22 !== null) { const d = c.share26 - c.share22; big = signed(d); color = d >= 0 ? P.blueHi : P.redHi; }
      else big = pct(c.share26);
      ctx.textAlign = "left"; ctx.fillStyle = color; ctx.font = `800 50px ${num}`; ctx.fillText(ltrText(big), L + 36, y + 50);
      ctx.fillStyle = P.soft; ctx.font = `600 24px ${num}`;
      ctx.fillText(ltrText(c.share22 !== null ? `2022: ${smallPct(c.share22) ?? "0"}%  ·  ${now}` : now), L + 36, y + 92);
      y += rowH + 16;
    });
  };

  if (spec.who === "all") {
    if (matrix) {
      if (spec.dir === "from") {
        const rows = flowsFor(spec.mode).lists.cameFrom.filter((r) => r.id !== "other" && r.id !== "abstain" && seats(r.id) > 0)
          .map((r) => (matrix === national ? r : { ...r, parts: cameFromGroup(matrix, [r.id]) }));
        grid(rows, bloc2026, "מ", (r) => String(seats(r.id)));
      } else grid(K25_PASSED.map((l) => ({ id: l, name: oldName(l), total: 0, parts: wentToGroup(matrixTo ?? matrix, [l]) })), bloc2022, "ל");
    } else if (units && place) {
      // עיר עם מעט קלפיות: רק האחוזים ב-2026 מול 2022
      const list = Object.keys(LETTER_OF).filter((id) => id !== "other").map((id) => ({ id, s: cityShares({ ...units, places: { [place[0]]: place[1] } }, [id])[0] }))
        .filter(({ s }) => s.share26 >= 1).sort((a, b) => b.s.share26 - a.s.share26).slice(0, 8);
      card(L, y, CW, 50 + list.length * 84); y += 50;
      for (const { id, s } of list) {
        ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `600 34px ${body}`; ctx.fillText(newName(id), R - 36, y + 10);
        ctx.textAlign = "left"; ctx.font = `800 50px ${num}`; ctx.fillText(pct(s.share26), L + 36, y + 10);
        if (s.share22 !== null) { ctx.fillStyle = P.soft; ctx.font = `500 26px ${num}`; ctx.fillText(ltrText(`2022: ${smallPct(s.share22) ?? "0"}%`), L + 180, y + 12); }
        y += 84;
      }
      ctx.textAlign = "center"; ctx.fillStyle = P.soft; ctx.font = `400 26px ${body}`; ctx.fillText("בעיר יש מעט קלפיות להשוואה, ולכן מוצגים רק האחוזים", IMG_W / 2, y + 20); y += 70;
    }
    if (spec.blocs && matrix) { y += 20; blocs(matrix); }
  } else {
    if (ids.length > 1) {
      // שתי מפלגות זו לצד זו; שם המפלגה והמנדטים פעם אחת — בכותרת הטור
      const gap = 24, w = (CW - gap) / 2;
      ids.forEach((id, k) => { const x = R - (k + 1) * w - k * gap; ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `800 44px ${display}`; ctx.fillText(newName(id), x + w - 12, y + 10); seatsAt(id, x + 12, y + 10); });
      y += 66;
      const top = y;
      // "לאן הלכו" באותו קו בשני הכרטיסים, ושני הכרטיסים באותו גובה (הכרעת בעלים)
      const slots = Math.max(...ids.map((id) => partyRows(id, 3)));
      const heights = ids.map((id, k) => { y = top; return partyCard(id, R - (k + 1) * w - k * gap, w, 3, slots) - top; });
      ctx.clearRect(0, top - 10, IMG_W, Math.max(...heights) + 20); // המעבר הראשון רק מדד גובה — מוחקים כדי שהכרטיסים לא יצוירו פעמיים
      const ends = ids.map((id, k) => { y = top; return partyCard(id, R - (k + 1) * w - k * gap, w, 3, slots, Math.max(...heights)); });
      y = Math.max(...ends) + 30;
    } else y = partyCard(ids[0], L, CW, 5) + 30;
    changes();
    if (spec.blocs) blocs(national);
    cities();
  }

  // סמל הגזרה בקטן, בפינה העליונה (לחברי הגזרה; הכרעת בעלים 28/10)
  if (spec.logo) { ctx.save(); ctx.beginPath(); ctx.arc(IMG_W - 92, 92, 34, 0, 2 * Math.PI); ctx.clip(); ctx.drawImage(spec.logo, IMG_W - 126, 58, 68, 68); ctx.restore(); }
  // תחתית: QR וכתובת האתר
  y += 20; drawQr(ctx, `${SITE_URL}#/changes`, L, y, QR_SIZE);
  ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 32px ${body}`; ctx.fillText("השוואת כל הקלפיות", R, y + 50);
  ctx.fillStyle = P.soft; ctx.font = `400 30px ${body}`; ctx.fillText(ltrText(host), R, y + 96);
  y += QR_SIZE + 80;

  // הרקע, ההילות והמסגרת — מתחת לתוכן, בגובה הסופי
  const H = Math.max(y, TARGET_H);
  const out = document.createElement("canvas"); out.width = IMG_W; out.height = H;
  const o = out.getContext("2d")!;
  o.fillStyle = P.bg; o.fillRect(0, 0, IMG_W, H);
  const glow = (x: number, yy: number, r: number, rgb: string, a: number) => { const g = o.createRadialGradient(x, yy, 0, x, yy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); o.fillStyle = g; o.fillRect(0, 0, IMG_W, H); };
  glow(IMG_W * .85, 120, 700, P.glowA, P.glowAlpha); glow(IMG_W * .1, H - 160, 700, P.glowB, P.glowBAlpha);
  const fr = o.createLinearGradient(0, 0, IMG_W, H); fr.addColorStop(0, P.blue); fr.addColorStop(1, P.red);
  o.strokeStyle = fr; o.lineWidth = 10; o.beginPath(); o.roundRect(22, 22, IMG_W - 44, H - 44, 48); o.stroke();
  // תמונה קצרה — התוכן ממורכז לגובה, בלי שטח ריק בתחתית
  o.drawImage(cv, 0, 0, IMG_W, y, 0, Math.max(0, (H - y) / 2), IMG_W, y);
  return await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []; let line = "";
  for (const w of text.split(" ")) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; }
  return line ? [...out, line] : out;
}

const PARTIES = flow.new.filter((id) => id !== "other" && id !== "abstain");

/** חלון השיתוף של "מה השתנה" (הכרעת בעלים 28.10.2026: פשטות בחירה) — מי; ורק ב"כל המפלגות" גם כיוון ואיפה */
export default function FlowShare({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [who, setWho] = useState<Who>("party");
  const [party, setParty] = useState(PARTIES[0]);
  const [where, setWhere] = useState<Where>("country");
  const [city, setCity] = useState("");
  const [dir, setDir] = useState<Dir>("from");
  const [blocs, setBlocs] = useState(false);
  const [units, setUnits] = useState<Units | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const logoUrl = useHagzara(useSession())?.logoUrl ?? null;
  const [logo, setLogo] = useState<ImageBitmap | null>(null);
  useEffect(() => { let live = true; void loadLogo(logoUrl).then((b) => live && setLogo(b)); return () => { live = false; }; }, [logoUrl]);
  useEffect(() => {
    const trigger = document.activeElement;
    box.current?.focus();
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}flow-units.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setUnits).catch(() => setMsg("נתוני הערים לא נטענו.")); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const names = useMemo(() => Object.entries(units?.places ?? {}).filter(([c]) => c !== ENVELOPES).map(([, p]) => p.name).sort(), [units]);
  const cityMode = who === "all" && where === "city";
  const ready = !!units && (!cityMode || names.includes(city.trim()));
  useEffect(() => {
    if (!ready) return;
    let live = true;
    render({ logo, who, party, where, city, dir, blocs, mode }, units)
      .then((b) => { if (!live) return; setFile(new File([b], "elections26-changes.png", { type: "image/png" })); setUrl(URL.createObjectURL(b)); })
      .catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; };
  }, [logo, who, party, where, city, dir, blocs, mode, units, ready]);
  const share = async () => {
    if (!file) return;
    countImage("changes");
    const text = `מאיפה הגיעו המצביעים של כל מפלגה?\nהשוואה של כל הקלפיות, 2022 מול 2026\n${SITE_URL}#/changes`;
    try {
      if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else save(true);
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור ולשתף."); }
  };
  // תמונה שנשמרה נספרת ("תמונת מה השתנה"); משיתוף שנפל לשמירה — כבר נספרה
  const save = (counted = false) => { if (!url || !file) return; if (!counted) countImage("changes"); const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); };
  const seg = <T extends string>(label: string, value: T, set: (v: T) => void, opts: { id: T; label: string }[]) => (
    <div className="f-seg fit" role="group" aria-label={label}>
      {opts.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => set(o.id)}>{o.label}</button>)}
    </div>
  );
  return createPortal(<div className="f-modal" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="f-flow-share">
      <h2 id="f-flow-share" className="text-lg font-bold">שיתוף: מה השתנה</h2>
      {seg("מי", who, setWho, [{ id: "all", label: "כל המפלגות" }, { id: "haredi", label: "חרדים" }, { id: "party", label: "מפלגה" }])}
      {who === "party" && <label className="grid gap-1 text-sm">מפלגה
        <select value={party} onChange={(e) => setParty(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base">
          {PARTIES.map((id) => <option key={id} value={id}>{newName(id)}</option>)}
        </select></label>}
      {who === "all" && <>
        {seg("כיוון", dir, setDir, [{ id: "from", label: "מאיפה הגיעו" }, { id: "to", label: "לאן הלכו" }])}
        {seg("איפה", where, setWhere, [{ id: "country", label: "כל הארץ" }, { id: "city", label: "עיר" }])}
        {where === "city" && <label className="grid gap-1 text-sm">עיר
          <input list="flow-share-cities" value={city} onChange={(e) => setCity(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base" />
          <datalist id="flow-share-cities">{names.map((n) => <option key={n} value={n} />)}</datalist></label>}
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocs} onChange={(e) => setBlocs(e.target.checked)} className="w-5 h-5" />להוסיף מעבר בין הגושים</label>
      {url && ready ? <img src={url} alt="תמונת שיתוף: מה השתנה" /> : <p className="text-sm text-ink-soft">{cityMode && units && !ready ? "בחרו עיר מהרשימה." : "מכינים את התמונה…"}</p>}
      {file && ready && <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={() => save()}>שמירה</button></div>}
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}
