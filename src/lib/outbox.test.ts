import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
vi.mock("./crowdApi", async (orig) => ({ ...(await orig<typeof import("./crowdApi")>()), CROWD_URL: "https://crowd", call: (...a: unknown[]) => call(...a) }));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const S = await import("./crowdSession");
const { flushOutbox, queuedUnits } = await import("./outbox");
const { CrowdError } = await import("./crowdApi");

const payload = { v2022: null, v2026: "undecided" };
function queue() {
  S.setToken("tok");
  S.opIdFor("vote", payload);
  S.setSaved("vote", payload);
}

describe("תור השליחה", () => {
  beforeEach(() => { store.clear(); call.mockReset(); });

  it("גרסה שנשמרה בדפדפן בלי אישור נשלחת שוב עם אותו op_id ויוצאת מהתור", async () => {
    queue();
    const op = S.pendingOp("vote")!.op;
    expect(queuedUnits()).toEqual(["vote"]);
    call.mockResolvedValue({ version: { id: 1 } });
    await flushOutbox();
    expect(call.mock.calls[0][1].body.op_id).toBe(op);
    expect(queuedUnits()).toEqual([]);
  });

  it("בלי חיבור, או כשהתשובה נחסמה — נשאר בתור", async () => {
    queue();
    call.mockResolvedValueOnce({ blind: true });
    await flushOutbox();
    expect(queuedUnits()).toEqual(["vote"]);
    call.mockRejectedValueOnce(new CrowdError(0, "network"));
    await flushOutbox();
    expect(queuedUnits()).toEqual(["vote"]);
  });

  it("השרת דחה את התוכן ⇐ יוצא מהתור וחוזר לטיוטה שלא נשמרה", async () => {
    queue();
    call.mockRejectedValueOnce(new CrowdError(400, "bad_payload"));
    await flushOutbox();
    expect(queuedUnits()).toEqual([]);
    expect(S.loadSaved("vote")).toBeNull();
    expect(S.loadDraft("vote")).toEqual(payload);
  });
});
