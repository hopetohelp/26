// שרת ה-MCP מקצה לקצה: שרת ההשתתפות האמיתי (worker/crowd) מעל מאגר מזויף, ושרת ה-MCP מעל מאגר משלו.
// הנתונים הציבוריים — קובצי הנתונים הפתוחים, נבנים כאן מאותו קטלוג שהאתר מפרסם (src/lib/openData.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import crowdWorker, { resetDashboardCache } from "../../crowd/index.js";
import { fakeD1 } from "../../crowd/test/fakeD1.js";
import { seats as seatsPayload } from "../../crowd/test/helpers.js";
import mcp from "../index.js";
import { resetSiteCache } from "../lib/site.js";
import { pkceChallenge } from "../lib/oauth.js";
import { validateAnswer, hasNumber } from "../lib/answer.js";
import { TOOLS } from "../lib/tools.js";
import { CARD_HTML } from "../lib/card.generated.js";
import { buildCardHtml } from "../card/template.mjs";
import { OPEN_FILES, buildFile, buildIndex, wrapExternal } from "../../../src/lib/openData.ts";
import { seatsFromPct } from "../../../src/lib/lawSeats.ts";

const SITE = "https://hopetohelp.github.io/26/";
const ISSUER = "https://mcp.example";
const SITE_FILES = new Map(OPEN_FILES.filter((f) => f.build).map((f) => [f.path, buildFile(f)]));
SITE_FILES.set("data/index.json", buildIndex(ISSUER));
SITE_FILES.set("dashboard.json", wrapExternal(OPEN_FILES.find((f) => f.path === "dashboard.json"), { publishedAt: "2026-10-05T09:00:00Z", participants: 0, open: false }));

let crowdEnv, env, t;
beforeEach(() => {
  resetDashboardCache();
  resetSiteCache();
  t = Date.parse("2026-10-05T10:05:00Z");
  crowdEnv = { DB: fakeD1(), ALLOWED_ORIGIN: "https://hopetohelp.github.io", SITE_URL: SITE, IP_KEY: "ip-secret", DATA_KEY: "data-secret", NOW: () => t };
  env = {
    DB: fakeD1(new URL("../schema.sql", import.meta.url)),
    SITE_URL: SITE, ALLOWED_ORIGIN: "https://hopetohelp.github.io", ISSUER,
    IP_KEY: "mcp-ip-secret", DATA_KEY: "mcp-data-secret", NOW: () => t,
    CROWD: { fetch: (req) => crowdWorker.fetch(req, crowdEnv) },
  };
  vi.stubGlobal("fetch", async (url) => {
    const path = String(url).replace(SITE, "");
    if (!SITE_FILES.has(path)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(SITE_FILES.get(path)), { headers: { "content-type": "application/json" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const req = (path, { method, body, headers = {}, form } = {}) =>
  mcp.fetch(new Request(ISSUER + path, {
    method: method ?? (body === undefined && form === undefined ? "GET" : "POST"),
    headers: { "content-type": form ? "application/x-www-form-urlencoded" : "application/json", "cf-connecting-ip": "9.9.9.9", ...headers },
    body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  }), env);
const crowd = (path, { body, token } = {}) =>
  crowdWorker.fetch(new Request("https://c.example" + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: "https://hopetohelp.github.io", "cf-connecting-ip": "5.5.5.5", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), crowdEnv).then(async (r) => ({ status: r.status, data: await r.json() }));
let rid = 1;
const rpc = async (path, method, params, token) => {
  const r = await req(path, { body: { jsonrpc: "2.0", id: rid++, method, params }, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.status, data: r.status === 202 ? null : await r.json(), headers: r.headers };
};
const call = (path, name, args, token) => rpc(path, "tools/call", { name, arguments: args }, token);

/** משתמש באתר + חיבור עוזר מלא (הרשמה, אישור במסך באתר, PKCE) ⇐ {access, refresh, web} */
async function connect({ admin = false } = {}) {
  const reg = await crowd("/auth/register", { body: { email: `u${Math.random().toString(36).slice(2)}@example.com`, password: "a long pass phrase" } });
  const web = reg.data.token;
  if (admin) {
    const p = crowdEnv.DB.raw.prepare("SELECT participant FROM sessions").all().at(-1).participant;
    crowdEnv.DB.raw.prepare("INSERT INTO admins (participant, added_at) VALUES (?, ?)").run(p, "2026-10-01T00:00:00Z");
  }
  const client = await (await req("/register", { body: { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } })).json();
  const verifier = "v".repeat(50);
  const challenge = await pkceChallenge(verifier);
  const auth = await req(`/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`);
  expect(auth.status).toBe(302);
  const loc = auth.headers.get("location");
  expect(loc.startsWith(`${SITE}#/connect?r=`)).toBe(true);
  const r = decodeURIComponent(loc.split("r=")[1]);
  // מסך "חיבור עוזר AI" באתר: מי מבקש ⇐ כניסת עוזר משרת ההשתתפות ⇐ אישור
  const info = await (await req(`/authorize/info?r=${encodeURIComponent(r)}`)).json();
  expect(info.client).toBe("Claude");
  const del = await crowd("/auth/delegate", { token: web, body: { client: info.client } });
  const ok = await (await req("/authorize/approve", { body: { r, agent: del.data.token, expiresAt: del.data.expiresAt }, headers: { origin: "https://hopetohelp.github.io" } })).json();
  const back = new URL(ok.redirect);
  expect(back.origin + back.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
  expect(back.searchParams.get("state")).toBe("xyz");
  const tok = await (await req("/token", { form: { grant_type: "authorization_code", code: back.searchParams.get("code"), client_id: client.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_verifier: verifier } })).json();
  expect(tok.token_type).toBe("Bearer");
  return { access: tok.access_token, refresh: tok.refresh_token, web, clientId: client.client_id };
}

describe("גילוי והתחברות (OAuth)", () => {
  it("מסמכי הגילוי, ו-401 עם הפניה אליהם בלי אסימון", async () => {
    const as = await (await req("/.well-known/oauth-authorization-server")).json();
    expect(as).toMatchObject({ issuer: ISSUER, code_challenge_methods_supported: ["S256"], registration_endpoint: `${ISSUER}/register` });
    const pr = await (await req("/.well-known/oauth-protected-resource/mcp")).json();
    expect(pr).toMatchObject({ resource: `${ISSUER}/mcp`, authorization_servers: [ISSUER] });
    const r = await rpc("/mcp", "initialize", {});
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("הזרימה המלאה: אישור במסך באתר, PKCE, רענון האסימון; קוד חד-פעמי; מאמת שגוי נדחה", async () => {
    const { access, refresh, clientId } = await connect();
    expect((await rpc("/mcp", "initialize", { protocolVersion: "2025-06-18" }, access)).data.result.protocolVersion).toBe("2025-06-18");
    const again = await (await req("/token", { form: { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId } })).json();
    expect(again.access_token).toBeTruthy();
    // האסימון הישן לרענון אינו עובד פעם שנייה
    expect((await req("/token", { form: { grant_type: "refresh_token", refresh_token: refresh, client_id: clientId } })).status).toBe(400);
    expect((await rpc("/mcp", "ping", {}, again.access_token)).data.result).toEqual({});
  });

  it("כתובת חזרה שאינה של הלקוח — דף שגיאה, לא הפניה; לקוח עם http חיצוני — נדחה ברישום", async () => {
    const bad = await req("/register", { body: { client_name: "x", redirect_uris: ["http://evil.example/cb"] } });
    expect(bad.status).toBe(400);
    const client = await (await req("/register", { body: { client_name: "x", redirect_uris: ["https://ok.example/cb"] } })).json();
    const r = await req(`/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent("https://evil.example/cb")}&code_challenge=${"a".repeat(43)}&code_challenge_method=S256`);
    expect(r.status).toBe(400);
    expect(r.headers.get("location")).toBeNull();
    expect(await r.text()).toContain("החיבור לא הצליח");
  });

  it("ניתוק באתר ⇐ העוזר מקבל 401 והחיבור נמחק", async () => {
    const { access, web } = await connect();
    expect((await call("/mcp", "get_my_account", {}, access)).status).toBe(200);
    const list = (await crowd("/account/connections", { token: web })).data.connections;
    expect(list[0].client).toBe("Claude");
    await crowd("/account/connections/revoke", { token: web, body: { id: list[0].id } });
    expect((await call("/mcp", "get_my_account", {}, access)).status).toBe(401);
    expect(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM grants").get().n).toBe(0);
  });
});

describe("הכלים", () => {
  it("/public: רק הכלים הציבוריים; כלי אישי ⇐ needs_login", async () => {
    const names = (await rpc("/public", "tools/list", {})).data.result.tools.map((x) => x.name);
    expect(names).toContain("get_poll_average");
    expect(names).toContain("calculate_seats");
    expect(names).toContain("show_answer");
    expect(names).not.toContain("get_my_account");
    expect(names.some((n) => n.startsWith("admin_"))).toBe(false);
    const r = await call("/public", "get_my_account", {});
    expect(r.data.result.isError).toBe(true);
    expect(r.data.result.structuredContent.error.code).toBe("needs_login");
  });

  it("נתונים ציבוריים — מקובצי הנתונים הפתוחים, עם about (תאריך, מקור, קישור)", async () => {
    const r = await call("/public", "get_poll_average", {});
    const d = r.data.result.structuredContent;
    expect(d.about.method).toContain("#/method#means");
    expect(d.average.seats).toEqual(SITE_FILES.get("data/average.json").average.seats);
    const polls = (await call("/public", "get_polls", { limit: 3 })).data.result.structuredContent;
    expect(polls.polls.length).toBeLessThanOrEqual(3);
    expect(polls.about.updatedAt).toBeTruthy();
  });

  it("מחשבון המנדטים — אותו מנוע ואותם נתונים כמו באתר", async () => {
    const shares = { likud: 22, yashar: 20, together: 11, democrats: 8, yb: 7, shas: 7, utj: 6.5, otzma: 6, rzp: 4, joint: 5, raam: 3.5 };
    const r = (await call("/public", "calculate_seats", { shares })).data.result.structuredContent;
    const site = seatsFromPct(Object.keys(SITE_FILES.get("data/law.json").lists.reduce((a, l) => ({ ...a, [l.id]: 1 }), {})), shares);
    expect(r.seats).toEqual(site.r.seats);
    expect(r.params.threshold).toBe(3.25);
    expect(Object.values(r.seats).reduce((a, b) => a + b, 0)).toBe(120);
  });

  it("משתמש מחובר: קורא וכותב באזור האישי שלו בלבד; פעולה חסומה לעוזר ⇐ הודעה ברורה", async () => {
    const { access } = await connect();
    const names = (await rpc("/mcp", "tools/list", {}, access)).data.result.tools.map((x) => x.name);
    expect(names).toContain("save_my_guess");
    expect(names.some((n) => n.startsWith("admin_"))).toBe(false);
    for (const forbidden of ["change_password", "delete_account", "admin_delete_group"]) expect(names).not.toContain(forbidden);
    const save = await call("/mcp", "save_my_guess", { unit: "seats", payload: seatsPayload(60) }, access);
    expect(save.data.result.isError).toBe(false);
    const guess = (await call("/mcp", "get_my_guess", {}, access)).data.result.structuredContent;
    expect(guess.latest.seats.payload.seats).toBeTruthy();
    const hist = (await call("/mcp", "get_my_history", { unit: "seats" }, access)).data.result.structuredContent;
    expect(hist.versions).toHaveLength(1);
    const account = (await call("/mcp", "get_my_account", {}, access)).data.result.structuredContent;
    expect(account.participant).toBeUndefined();
    // כלי מנהל — לא למשתמש רגיל
    expect((await call("/mcp", "admin_get_guesses", {}, access)).data.result.structuredContent.error.code).toBe("forbidden");
  });

  it("מנהל האתר: כלי מסך הניהול גלויים ועובדים; מחיקת קבוצה — אין כלי", async () => {
    const { access } = await connect({ admin: true });
    const names = (await rpc("/mcp", "tools/list", {}, access)).data.result.tools.map((x) => x.name);
    expect(names).toContain("admin_get_guesses");
    expect(names).not.toContain("admin_delete_group");
    expect((await call("/mcp", "admin_get_guesses", {}, access)).data.result.isError).toBe(false);
    const imp = await call("/mcp", "admin_import_group", { group: "grp-a", name: "קבוצה", emails: ["a@example.com"], mode: "replace" }, access);
    expect(imp.data.result.isError).toBe(false);
  });

  it("סימוני הכלים: קריאה בלבד, כתיבה, ומחיקה שמבקשת אישור", () => {
    const by = Object.fromEntries(TOOLS.map((x) => [x.name, x]));
    expect(by.clear_my_history.kind).toBe("destructive");
    expect(by.save_my_guess.kind).toBe("write");
    expect(by.get_polls.kind).toBe("read");
    for (const x of TOOLS) expect(x.description.length, x.name).toBeGreaterThan(40);
  });

  it("הגבלת קצב בכתובת הציבורית ⇐ 429; תיעוד השימוש בלי פרטים מזהים", async () => {
    let last;
    for (let i = 0; i < 61; i++) last = await call("/public", "get_site_overview", {});
    expect(last.status).toBe(429);
    const cols = env.DB.raw.prepare("PRAGMA table_info(usage)").all().map((c) => c.name);
    expect(cols).toEqual(["day", "tool", "mode", "client", "outcome", "n"]);
    expect(env.DB.raw.prepare("SELECT SUM(n) AS n FROM usage WHERE tool = 'get_site_overview'").get().n).toBe(60);
  });
});

describe("כרטיס התשובה (show_answer)", () => {
  const urlFor = (a) => (["model", "current", "engine"].includes(a) ? `${SITE}#/method#${a}` : null);
  const good = {
    title: "מפלגות הממשלה היוצאת בממוצע הסקרים",
    sections: [
      { kind: "numbers", items: [{ label: "מפלגות הממשלה היוצאת", value: "53 מנדטים", kind: "סיכום סקרים", asOf: "11.10.2026", method: "model" }] },
      { kind: "text", heading: "מה זה אומר", text: "לרוב דרושים 61 מנדטים.", source: { kind: "חישוב לפי החוק", asOf: "11.10.2026", method: "engine" } },
    ],
    suggested_questions: ["מה טווח התרחישים?"],
  };
  it("תשובה תקינה עוברת, עם הקישור המלא לכל מקור", () => {
    const r = validateAnswer(good, urlFor);
    expect(r.ok).toBe(true);
    expect(r.answer.sections[0].items[0].source.url).toBe(`${SITE}#/method#model`);
  });
  it("מספר בלי מקור, עוגן שאינו במילון, המילה האסורה, תחזית מי ינצח, אנגלית — נדחים", () => {
    const bad = (patch) => validateAnswer({ ...good, ...patch }, urlFor);
    expect(bad({ sections: [{ kind: "text", text: "לליכוד 23 מנדטים." }] }).problems.join()).toContain("חובה מקור");
    expect(bad({ sections: [{ kind: "numbers", items: [{ ...good.sections[0].items[0], method: "nope" }] }] }).ok).toBe(false);
    expect(bad({ summary: "ההסתברות גבוהה" }).problems.join()).toContain("אסורה");
    expect(bad({ summary: "הסיכוי שלו גבוה" }).ok).toBe(false);
    expect(bad({ summary: "הליכוד ינצח בבחירות" }).problems.join()).toContain("מי ינצח");
    expect(bad({ summary: "This whole answer is in English" }).problems.join()).toContain("בעברית");
    expect(bad({ title: "53 מנדטים לממשלה" }).ok).toBe(false);
  });
  it("תאריכים ושנים אינם מספר מחושב; אחוז כן", () => {
    expect(hasNumber("נכון ל-11.10.2026 ובבחירות 2022, הכנסת ה-26")).toBe(false);
    expect(hasNumber("3.25%")).toBe(true);
  });
  it("דרך השרת: נדחית עם כל הבעיות, ותקינה חוזרת לכרטיס; הכרטיס מוצהר ככלי עם ממשק", async () => {
    const list = (await rpc("/public", "tools/list", {})).data.result.tools.find((x) => x.name === "show_answer");
    expect(list._meta.ui.resourceUri).toMatch(/^ui:\/\/elections26\/answer-card\?v=/);
    const rej = await call("/public", "show_answer", { ...good, summary: "הסתברות" });
    expect(rej.data.result.isError).toBe(true);
    expect(rej.data.result.content[0].text).toContain("התשובה נדחתה");
    const ok = await call("/public", "show_answer", good);
    expect(ok.data.result.structuredContent.answer.title).toBe(good.title);
    const res = await rpc("/public", "resources/read", { uri: list._meta.ui.resourceUri });
    expect(res.data.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
  });
  it("אינדקס בלי anchors (בנייה ישנה) — עוגני המילון עדיין תקפים", async () => {
    const { anchors: _a, ...old } = SITE_FILES.get("data/index.json");
    SITE_FILES.set("data/index.json", old);
    try {
      expect((await call("/public", "show_answer", good)).data.result.isError).toBe(false);
    } finally { SITE_FILES.set("data/index.json", buildIndex(ISSUER)); }
  });
  it("הכרטיס הנגזר מעודכן לטוקנים של האתר, בלי innerHTML ובלי רשת", () => {
    const r = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
    const html = buildCardHtml({ indexCss: r("../../../src/index.css"), cardCss: r("../card/card.css"), cardJs: r("../card/card.js"), site: SITE });
    expect(html, "הריצו: node worker/mcp/card/build.mjs").toBe(CARD_HTML);
    expect(r("../card/card.js")).not.toMatch(/innerHTML|fetch\(|XMLHttpRequest/);
    expect(CARD_HTML).toContain('lang="he" dir="rtl"');
    expect(CARD_HTML).toContain("prefers-color-scheme: dark");
    expect(r("../card/card.css")).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
