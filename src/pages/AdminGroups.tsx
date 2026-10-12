import { useEffect, useState } from "react";
import { Btn, Field, Notice, inputCls } from "./guess/ui";
import GroupUpload from "../components/GroupUpload";
import { AdminGroupsGuide } from "../components/GroupGuide";
import type { GroupImportResult, GroupStats as Stats } from "../lib/crowdApi";
import GroupStats from "../components/GroupStats";

/**
 * קבוצות למנהל האתר (docs/פילוח-קבוצות-תכנון.md): יצירה, העלאת רשימת מיילים, מינוי מנהל קבוצה ומחיקה.
 * הנתונים נשמרים בשרת ההשתתפות; ממשק הניהול מעביר אליו עם הרשאת הניהול.
 */
type Manager = { handle: string; email: string | null; active: boolean; addedAt: string };
type Group = { id: string; name: string | null; members: number; managers?: number; managerList?: Manager[]; createdAt: string };
type Api = (path: string, body?: unknown) => Promise<unknown>;

export default function AdminGroups({ api }: { api: Api }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const load = async () => {
    try { setGroups(((await api("/admin/groups")) as { groups: Group[] }).groups); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load(); } catch (e) { setError((e as Error).message); } };
  // מזהה פנימי — נוצר לבד (אותיות וספרות אקראיות); מוצג רק השם
  const newId = () => "g" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");

  return (
    <section className="space-y-3" aria-label="קבוצות">
            <p className="text-xs text-ink-soft">חבר בקבוצה = חשבון שמייל מאומת שלו ברשימה. הנתונים מוצגים לחברים בלבד, מ-50 משתתפים.</p>
      <AdminGroupsGuide />
      {error && <Notice tone="warn">{error}</Notice>}
      {groups?.map((g) => <GroupRow key={g.id} g={g} api={api} act={act} />)}
      <div className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-3">
        <p className="font-bold">קבוצה חדשה</p>
        <Field label="שם שיוצג לחברים"><input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
        <Btn kind="primary" disabled={!newName.trim()} onClick={act(async () => { await api("/admin/groups/import", { group: newId(), name: newName.trim(), emails: [] }); setNewName(""); })}>יצירה</Btn>
      </div>
    </section>
  );
}

function GroupRow({ g, api, act }: { g: Group; api: Api; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [manager, setManager] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <details className="group bg-paper-card border border-paper-line rounded-theme [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-3 min-h-[56px]">
        <span><span className="font-bold">{g.name ?? g.id}</span> <span className="text-sm text-ink-soft tabular">· {g.members.toLocaleString("he-IL")} מיילים ברשימה · {g.managers ?? 0} {g.managers === 1 ? "מנהל" : "מנהלים"}</span></span>
        <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-3 pb-3 space-y-3">
      <GroupStats load={() => api("/admin/groups/stats", { group: g.id }) as Promise<Stats>} refresh={g.members} />
      <p className="font-bold text-sm">מנהלי הקבוצה</p>
      {g.managerList?.length ? (
        <ul className="text-sm divide-y divide-paper-line border-y border-paper-line">
          {g.managerList.map((m) => (
            <li key={m.handle} className="flex items-center justify-between gap-3 py-2 flex-wrap">
              <span className="min-w-0">
                <span dir="ltr" className="break-all">{m.email ?? "(מייל לא שמור)"}</span>
                <span className="block text-xs text-ink-soft">{m.active ? "פעיל" : "ממתין להרשמה ולאימות המייל"}</span>
              </span>
              <Btn kind="danger" onClick={act(() => api("/admin/groups/managers", { group: g.id, remove: true, handle: m.handle }))}>הסרה</Btn>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-soft">עדיין אין מנהלים.</p>}
      <Field label="הוספת מנהל (מייל)" hint="אפשר למנות כמה מנהלים — כל מייל בנפרד. ההרשאה תופסת כשהמייל מאומת בחשבון. מנהל קבוצה מעלה רשימה רק לקבוצה הזו.">
        <input dir="ltr" type="email" className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} />
      </Field>
      <Btn disabled={!manager.includes("@")} onClick={act(async () => { await api("/admin/groups/managers", { group: g.id, email: manager }); setManager(""); })}>מינוי</Btn>
      <p className="font-bold text-sm pt-2">רשימת החברים</p>
      <GroupUpload send={(chunk) => api("/admin/groups/import", { group: g.id, ...chunk }) as Promise<GroupImportResult>} onDone={() => void act(async () => {})()} />
      <div className="flex flex-wrap gap-2 pt-2">
        {sure
          ? <Btn kind="danger" onClick={act(() => api("/admin/groups/delete", { group: g.id }))}>למחוק את הקבוצה והרשימה?</Btn>
          : <Btn kind="danger" onClick={() => setSure(true)}>מחיקת הקבוצה</Btn>}
      </div>
      </div>
    </details>
  );
}
