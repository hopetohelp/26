import { materializeAnswer } from "./evidence.js";
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
  "This server is the data of \"בחירות 2026\" (https://26.hopetohelp.net/), an independent Hebrew site that analyses Israel's Knesset election of 27.10.2026. It collects published polls (it does not conduct polls) and recommends no list.",
  "Answer only from this site's data (the tools), in Hebrew. Stay neutral: no opinion, no recommendation, no prediction of who will win. Scenarios are \"שיעור תרחישים\" — never chance or probability. Participants' guesses are not a poll.",
  "Numbers the site computed: in show_answer, in a \"numbers\" section, pass kind, asOf and method (the data file's about.kind, about.updatedAt and about.method); the card shows only the date and the \"איך זה חושב?\" link, once per source. Never write the data type (\"סיכום סקרים\") in the text. General knowledge (61 seats for a majority, the 3.25% threshold) needs no source line. \"מפלגות הממשלה היוצאת\" is a factual definition (government 37).",
  "Identify the actual requested source: ממוצע סקרים, ממוצע מותאם, ממוצע המודל. The current site shows only polls.mean and polls.adjusted; model.mean and scenarios are archived research, never a default comparison. Custom averages filter firms and keep equal weight per latest firm-publisher series. Fetch get_data_metric and pass its evidence; never supply numeric tile values or numeric table cells as free text.",
  "Do not state a well-known fact on its own; connect it to the data. Not \"לרוב בכנסת דרושים 61 מנדטים\" but \"חסרים להם 8 מנדטים לרוב\" (61 minus their seats).",
  "Never repeat the same information on one screen: one date, one \"איך זה חושב?\" link per source — the card prints each only once. A heading says what the reader sees (\"מנדטים לפי גושים\"), never the data type (\"סיכום סקרים\"). In a number tile, value is only the main number; the range or the context goes in detail (a separate, smaller line).",
  "Always finish with show_answer — also when you searched the web or used other sources: it shows the final answer as a card in the site's design, and checks those rules. Do not write the answer as plain text or a table instead of the card. Information that is not from the site goes in one short line after the card, marked as not from the site.",
  "Current navigation: בית; הכנסת שלי (complete a 120-seat guess before viewing participant averages, with a return to editing); סקרים (היום, מגמות, ארכיון); בחירות קודמות (results including 2015, accuracy, מה השתנה); מידע; אישי. Historical locality tables include external envelopes separately. Last-poll errors are percentage points of seats, not vote share. Use get_site_overview for current links. The card follows the blue-white C design in light/dark mode.",
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
        serverInfo: { name: "elections26", title: "בחירות 2026", version: "1.0.0", websiteUrl: ctx.env.SITE_URL },
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

// אחרי כל כלי נתונים — תזכורת לסיים בכרטיס (נמדד 12.10.2026: Claude קרא לנתונים וענה בטקסט רגיל, בלי show_answer)
const NEXT_STEP = "Next: give the final answer only through show_answer (the site's card, in Hebrew). Anything not from the site goes in one short line after the card.";
const textResult = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }, { type: "text", text: NEXT_STEP }], structuredContent: data && typeof data === "object" && !Array.isArray(data) ? data : { value: data }, isError: false });
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
      const check = validateAnswer(await materializeAnswer(ctx, args), await methodUrlFor(ctx.env, ctx.now));
      if (!check.ok) {
        await ctx.log(name, "rejected");
        return toolError("invalid_input", `התשובה נדחתה: ${check.problems.slice(0, 10).join(" · ")}${check.problems.length > 10 ? ` · ועוד ${check.problems.length - 10}` : ""}. תקנו הכול ושלחו שוב את התשובה המלאה.`);
      }
      await ctx.log(name, "ok");
      return { content: [{ type: "text", text: "The card is now shown to the user. Do not repeat its content in text; add only what is not in it (another source), in one short line." }], structuredContent: { answer: check.answer }, isError: false };
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
