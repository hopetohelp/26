import { useEffect, useState } from "react";
import { Btn, Field, Notice, inputCls } from "./guess/ui";
import GroupUpload from "../components/GroupUpload";
import { AdminGroupsGuide } from "../components/GroupGuide";
import type { GroupImportResult } from "../lib/crowdApi";

/**
 * קבוצות למנהל האתר (docs/פילוח-קבוצות-תכנון.md): יצירה, העלאת רשימת מיילים, מינוי מנהל קבוצה ומחיקה.
 * הנתונים נשמרים בשרת ההשתתפות; ממשק הניהול מעביר אליו עם הרשאת הניהול.
 */
type Group = { id: string; name: string | null; members: number; createdAt: string };
type Api = (path: string, body?: unknown) => Promise<unknown>;

export default function AdminGroups({ api }: { api: Api }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const load = async () => {
    try { setGroups(((await api("/admin/groups")) as { groups: Group[] }).groups); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (f: () => Promise<unknown>) => async () => { setError(null); try { await f(); await load(); } catch (e) { setError((e as Error).message); } };
  const idOk = /^[a-z0-9-]{2,32}$/.test(newId);

  return (
    <section className="space-y-3" aria-label="קבוצות">
      <h2 className="font-display text-2xl">קבוצות</h2>
      <p className="text-xs text-ink-soft">חבר בקבוצה = חשבון שמייל מאומת שלו ברשימה. הנתונים מוצגים לחברים בלבד, מ-50 משתתפים.</p>
      <AdminGroupsGuide />
      {error && <Notice tone="warn">{error}</Notice>}
      {groups?.map((g) => <GroupRow key={g.id} g={g} api={api} act={act} />)}
      <div className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-3">
        <p className="font-bold">קבוצה חדשה</p>
        <Field label="מזהה (אותיות לטיניות קטנות, ספרות ומקף)"><input dir="ltr" className={inputCls} value={newId} onChange={(e) => setNewId(e.target.value.trim())} /></Field>
        <Field label="שם שיוצג לחברים"><input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
        <Btn kind="primary" disabled={!idOk || !newName.trim()} onClick={act(async () => { await api("/admin/groups/import", { group: newId, name: newName.trim(), emails: [] }); setNewId(""); setNewName(""); })}>יצירה</Btn>
      </div>
    </section>
  );
}

function GroupRow({ g, api, act }: { g: Group; api: Api; act: (f: () => Promise<unknown>) => () => Promise<void> }) {
  const [manager, setManager] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <div className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-3">
      <p className="font-bold">{g.name ?? g.id} <span className="font-normal text-sm text-ink-soft tabular">· {g.members} מיילים ברשימה</span></p>
      <GroupUpload send={(chunk) => api("/admin/groups/import", { group: g.id, ...chunk }) as Promise<GroupImportResult>} />
      <Field label="מנהל קבוצה (מייל)" hint="ההרשאה תופסת כשהמייל מאומת בחשבון. מנהל קבוצה מעלה רשימה רק לקבוצה הזו.">
        <input dir="ltr" type="email" className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn disabled={!manager.includes("@")} onClick={act(async () => { await api("/admin/groups/managers", { group: g.id, email: manager }); setManager(""); })}>מינוי</Btn>
        <Btn disabled={!manager.includes("@")} onClick={act(async () => { await api("/admin/groups/managers", { group: g.id, email: manager, remove: true }); setManager(""); })}>הסרת מינוי</Btn>
        {sure
          ? <Btn kind="danger" onClick={act(() => api("/admin/groups/delete", { group: g.id }))}>למחוק את הקבוצה והרשימה?</Btn>
          : <Btn kind="danger" onClick={() => setSure(true)}>מחיקת הקבוצה</Btn>}
      </div>
    </div>
  );
}
