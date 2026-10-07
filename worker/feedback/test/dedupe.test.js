import { describe, it, expect } from "vitest";
import worker from "../index.js";

/** מאגר מזויף מינימלי: רק מה ששרת ההערות שואל */
function fakeDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            first: async () => {
              if (sql.includes("SELECT 1 AS d")) return rows.some((r) => r.day_key === a[0] && r.text === a[1]) ? { d: 1 } : null;
              if (sql.includes("AS n")) return { n: rows.filter((r) => r.day_key === a[0]).length };
              return null;
            },
            run: async () => {
              rows.push({ day_key: a[5], text: a[2] });
            },
          };
        },
      };
    },
  };
}

const env = { DB: fakeDb(), ALLOWED_ORIGIN: "https://hopetohelp.github.io" };
const send = async (text, ip = "1.2.3.4", diagnostic) =>
  (await worker.fetch(
    new Request("https://w.example/", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin: env.ALLOWED_ORIGIN },
      body: JSON.stringify({ topic: "design", text, page: "/", theme: "board", website: "", diagnostic }),
    }),
    env,
  )).json();

describe("הערה זהה מאותו מקור", () => {
  it("הראשונה נשמרת, הכפולה לא", async () => {
    const a = await send("שיהיה יותר ברור");
    expect(a.ok).toBe(true);
    expect(a.token).toBeTruthy();
    const b = await send("שיהיה יותר ברור");
    expect(b).toEqual({ ok: true, duplicate: true });
    expect(env.DB.rows).toHaveLength(1);
  });
  it("נוסח אחר, או מקור אחר — נשמר", async () => {
    await send("הערה ראשונה");
    expect((await send("הערה שנייה")).token).toBeTruthy();
    expect((await send("הערה ראשונה", "9.9.9.9")).token).toBeTruthy();
  });
});

 describe("לוג מצורף", () => {
  it("נשמר בשלמותו גם מעבר למגבלת טקסט ההערה", async () => {
    const log = "מחסנית\n".repeat(500);
    const res = await send("תקלת שמירה", "3.3.3.3", log);
    expect(res.ok).toBe(true);
    expect(env.DB.rows.at(-1).text).toBe(`תקלת שמירה\n\n--- לוג התקלה ---\n${log}`);
  });
  it("לוג גדול מדי נדחה בלי חיתוך שקט", async () => {
    expect(await send("גדול", "4.4.4.4", "x".repeat(16001))).toEqual({ ok: false, error: "diagnostic too large" });
  });
});

it("לוג מצורף נשמר גם בתגובה לשיחה קיימת", async () => {
  const inserted = [];
  const DB = {
    prepare(sql) {
      return { bind(...args) { return {
        first: async () => sql.includes('token_hash =') ? { id: 1, text: 'קודם' } : sql.includes('AS n') ? { n: 0 } : null,
        sql, args,
      }; } };
    },
    batch: async (stmts) => inserted.push(...stmts.filter(s => s.sql.startsWith('INSERT'))),
  };
  const diagnostic = 'stack\n'.repeat(500);
  const response = await worker.fetch(new Request('https://w.example/thread', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: 'abcdefghijklmnopqrstuv', text: 'תקלה', diagnostic }),
  }), { DB, ALLOWED_ORIGIN: env.ALLOWED_ORIGIN });
  expect((await response.json()).ok).toBe(true);
  expect(inserted[0].args[2]).toBe(`תקלה\n\n--- לוג התקלה ---\n${diagnostic}`);
});
