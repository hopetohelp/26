/**
 * MCP מעל HTTP (Streamable HTTP, בלי מצב: כל בקשה עומדת בפני עצמה) — JSON-RPC 2.0.
 * initialize · tools/list · tools/call · resources/list · resources/read · ping. הודעה (בלי id) ⇐ 202 בלי גוף.
 */
import { TOOL_BY_NAME, ToolError, visibleTools, toolListEntry } from "./tools.js";
import { validateAnswer } from "./answer.js";
import { methodUrlFor } from "./site.js";
import { CARD_HTML, CARD_HASH } from "./card.generated.js";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const CARD_URI_BASE = "ui://elections26/answer-card";
export const CARD_URI = `${CARD_URI_BASE}?v=${CARD_HASH.slice(0, 8)}`;
const CARD_MIME = "text/html;profile=mcp-app";
const CARD_META = { ui: { prefersBorder: false, csp: {} } };

/** החיבור אבד באתר (המשתמש ניתק, החליף סיסמה) ⇐ 401 לעוזר, והוא יבקש להתחבר מחדש */
export class AuthLost extends Error {}

export const INSTRUCTIONS = [
  "This server is the data of \"בחירות 2026 — ניתוח\" (https://hopetohelp.github.io/26/), an independent Hebrew site that analyses Israel's Knesset election of 27.10.2026. It collects published polls (it does not conduct polls) and recommends no list.",
  "Answer only from this site's data (the tools), in Hebrew. Stay neutral: no opinion, no recommendation, no prediction of who will win. Scenarios are \"שיעור תרחישים\" — never chance or probability. Participants' guesses are not a poll.",
  "Numbers the site computed: give their kind, date and \"איך זה חושב?\" link (the data file's about.kind, about.updatedAt and about.method) — in show_answer, in a \"numbers\" section. General knowledge (61 seats for a majority, the 3.25% threshold) needs no source line. \"מפלגות הממשלה היוצאת\" is a factual definition (government 37).",
  "Whenever you mention the poll average, give both: the simple average (ממוצע פשוט — the mean of each pollster's latest poll in the last 14 days, latestPerPollster.summary) and the model average (ממוצע המודל — average.seats). They differ; neither is a predicted result.",
  "Do not state a well-known fact on its own; connect it to the data. Not \"לרוב בכנסת דרושים 61 מנדטים\" but \"חסרים להם 8 מנדטים לרוב\" (61 minus their seats).",
  "Never repeat the same information on one screen: one date, one \"איך זה חושב?\" link per source — the card prints each only once. A heading says what the reader sees (\"מנדטים לפי גושים\"), never the data type (\"סיכום סקרים\"). In a number tile, value is only the main number; the range or the context goes in detail (a separate, smaller line).",
  "Finish with show_answer: it shows the final answer as a card in the site's design, and checks those rules.",
  "Changing anything for the user (saving a guess, clearing history, admin actions) — only when the user asked for it; confirm before destructive actions.",
].join("\n");

const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });

/**
 * ctx: { env, now, mode: "public"|"user", clientName, site(path), crowd(path, opts), me(), log(tool, outcome) }
 * ⇐ אובייקט JSON-RPC לתשובה, או null להודעה.
 */
export async function handleRpc(msg, ctx) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return null; // notifications/initialized ודומיה
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "elections26", title: "בחירות 2026 — ניתוח", version: "1.0.0", websiteUrl: ctx.env.SITE_URL },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list": {
      const admin = ctx.mode === "user" ? !!(await ctx.me().catch((e) => { if (e instanceof AuthLost) throw e; return {}; })).isAdmin : false;
      return rpcResult(id, {
        tools: visibleTools(ctx.mode, admin).map((t) => toolListEntry(t, t.name === "show_answer" ? { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI } : undefined)),
      });
    }
    case "resources/list":
      return rpcResult(id, { resources: [{ uri: CARD_URI, name: "answer_card", title: "כרטיס התשובה", description: "The site's card that shows a final answer from show_answer (Hebrew, RTL).", mimeType: CARD_MIME, _meta: CARD_META }] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "resources/read": {
      const uri = params.uri;
      if (typeof uri !== "string" || !(uri === CARD_URI_BASE || uri.startsWith(CARD_URI_BASE + "?"))) return rpcError(id, -32002, "Resource not found");
      return rpcResult(id, { contents: [{ uri, mimeType: CARD_MIME, text: CARD_HTML, _meta: CARD_META }] });
    }
    case "tools/call":
      return rpcResult(id, await callTool(params, ctx));
    default:
      return rpcError(id, -32601, "Method not found");
  }
}

const textResult = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data && typeof data === "object" && !Array.isArray(data) ? data : { value: data }, isError: false });
const toolError = (code, message) => ({ content: [{ type: "text", text: message }], structuredContent: { error: { code, message } }, isError: true });

async function callTool(params, ctx) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  const tool = typeof name === "string" ? TOOL_BY_NAME.get(name) : undefined;
  if (!tool) return toolError("unknown_tool", `אין כלי בשם ${String(name)}.`);
  if (tool.audience !== "public" && ctx.mode !== "user") {
    await ctx.log(name, "needs_login");
    return toolError("needs_login", "הכלי הזה דורש התחברות לחשבון האתר: חברו את הכתובת /mcp (במקום /public).");
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) return toolError("invalid_input", "הארגומנטים חייבים להיות אובייקט.");
  try {
    if (tool.name === "show_answer") {
      const check = validateAnswer(args, await methodUrlFor(ctx.env, ctx.now));
      if (!check.ok) {
        await ctx.log(name, "rejected");
        return toolError("invalid_input", `התשובה נדחתה: ${check.problems.slice(0, 10).join(" · ")}${check.problems.length > 10 ? ` · ועוד ${check.problems.length - 10}` : ""}. תקנו הכול ושלחו שוב את התשובה המלאה.`);
      }
      await ctx.log(name, "ok");
      return { content: [{ type: "text", text: "התשובה הועברה להצגה בכרטיס." }], structuredContent: { answer: check.answer }, isError: false };
    }
    if (tool.audience === "admin" && !(await ctx.me()).isAdmin) {
      await ctx.log(name, "forbidden");
      return toolError("forbidden", "הכלי הזה רק למנהל האתר.");
    }
    const data = await tool.run(ctx, args);
    await ctx.log(name, "ok");
    return textResult(data);
  } catch (e) {
    if (e instanceof AuthLost) throw e;
    const code = e instanceof ToolError ? e.code : e?.code ?? "error";
    await ctx.log(name, code === "error" ? "error" : "refused");
    return toolError(code, e instanceof ToolError || e?.userMessage ? (e.userMessage ?? e.message) : "שגיאה זמנית. נסו שוב בעוד רגע.");
  }
}
