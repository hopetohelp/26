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
const send = async (text, ip = "1.2.3.4") =>
  (await worker.fetch(
    new Request("https://w.example/", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin: env.ALLOWED_ORIGIN },
      body: JSON.stringify({ topic: "design", text, page: "/", theme: "board", website: "" }),
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
