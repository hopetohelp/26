/**
 * חיבור עוזר AI לחשבון (שרת ה-MCP, worker/mcp; הכרעת בעלים 12.10.2026).
 * מסך "חיבור עוזר AI" (src/pages/Connect.tsx) מקבל בקשה מהשרת, מבקש משרת ההשתתפות כניסת עוזר נפרדת (POST /auth/delegate)
 * ושולח אותה לשרת ה-MCP. סשן הדפדפן עצמו אינו נשלח לשרת ה-MCP לעולם.
 */
export const MCP_URL = (import.meta.env.VITE_MCP_URL ?? "").replace(/\/$/, "") || null;
/** שתי הכתובות: עם התחברות לחשבון (המפורסמת), ובלי התחברות — מוצגת רק למנהל האתר (הכרעת בעלים 12.10.2026) */
export const MCP_ADDRESSES = MCP_URL ? { public: `${MCP_URL}/public`, withLogin: `${MCP_URL}/mcp` } : null;

export interface ConnectRequest {
  client: string;
  returnHost: string;
  expiresAt: string;
}

export interface Connection {
  id: string;
  client: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

export class ConnectError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function mcp<T>(path: string, body?: unknown): Promise<T> {
  if (!MCP_URL) throw new ConnectError("offline", "החיבור לעוזרי AI עוד לא פעיל באתר.");
  let res: Response;
  try {
    res = await fetch(MCP_URL + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ConnectError("network", "אין חיבור לשרת העוזרים. בדקו את החיבור ונסו שוב.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ConnectError(data?.error ?? `http_${res.status}`, data?.error_description ?? "החיבור לא הצליח. התחילו שוב מתוך העוזר.");
  return data as T;
}

export const connectRequest = (r: string) => mcp<ConnectRequest>(`/authorize/info?r=${encodeURIComponent(r)}`);
export const approveConnect = (r: string, agent: string, expiresAt: string) => mcp<{ redirect: string }>("/authorize/approve", { r, agent, expiresAt });
export const denyConnect = (r: string) => mcp<{ redirect: string }>("/authorize/deny", { r });
