import { afterEach, describe, expect, it, vi } from "vitest";
import { isFeedbackToken, linkWithFeedback } from "./feedback";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("שיחת הערות בקישור האישי", () => {
  const tok = "Q7WOcjVJpUUJg8zQq5B7bA";
  it("אסימון תקין נוסף לקישור (&f=) ומוצפן לכתובת", () => {
    expect(linkWithFeedback("https://x/#/guess?t=abc", tok)).toBe(`https://x/#/guess?t=abc&f=${tok}`);
  });
  it("אין שיחה או אסימון לא תקין — הקישור לא משתנה", () => {
    expect(linkWithFeedback("https://x/#/guess?t=abc", null)).toBe("https://x/#/guess?t=abc");
    expect(linkWithFeedback("https://x/#/guess?t=abc", "<script>")).toBe("https://x/#/guess?t=abc");
  });
  it("בדיקת צורת האסימון", () => {
    expect(isFeedbackToken(tok)).toBe(true);
    expect(isFeedbackToken("short")).toBe(false);
    expect(isFeedbackToken(5)).toBe(false);
  });
});

describe("איחוד שיחות שמורות", () => {
  const a = { token: "abcdefghijklmnopqrstuv", created: "2026-10-01", preview: "א" };
  const b = { token: "zyxwvutsrqponmlkjihgfe", created: "2026-10-02", preview: "ב" };
  async function setup() {
    let value = JSON.stringify([b, a]);
    vi.stubGlobal("localStorage", { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } });
    vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
    vi.resetModules();
    return import("./feedback");
  }
  it("successful merge leaves one link; links added during the request survive", async () => {
    const api = await setup();
    const extra = { token: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", created: "2026-10-03", preview: "ג" };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { api.saveThread(extra); return new Response(JSON.stringify({ ok: true, token: b.token })); });
    vi.stubGlobal("fetch", fetchMock);
    expect(await api.mergeSavedThreads()).toEqual(b);
    expect(api.savedThreads()).toEqual([b, extra]);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).tokens).toEqual([b.token, a.token]);
  });
  it("failed merge preserves every saved link", async () => {
    const api = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 })));
    await expect(api.mergeSavedThreads()).rejects.toThrow("not found");
    expect(api.savedThreads()).toEqual([b, a]);
  });
});

it("שיחת חשבון נשלחת ישירות לשרת ההערות בלי כותרת זהות", async () => {
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
  vi.resetModules();
  const { accountSupport } = await import("./feedback");
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ok:true,thread:null})));
  vi.stubGlobal("fetch", fetchMock);
  expect(await accountSupport("private-account-token", {text:"[רעיון] בדיקה",op_id:"operation-123456789",website:""})).toBe(null);
  expect(fetchMock.mock.calls[0]).toEqual(["https://feedback.example/", expect.objectContaining({method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"account-support",token:"private-account-token",text:"[רעיון] בדיקה",op_id:"operation-123456789",website:""})})]);
});
