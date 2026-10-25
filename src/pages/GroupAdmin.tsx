import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { call, type GroupCompare, type GroupInsights, type GroupLinkStats, type GroupSeries, type GroupSeriesKey } from "../lib/crowdApi";
import GroupSeriesChart, { bucketLabel } from "../components/GroupSeriesChart";
import AdminGuesses from "./AdminGuesses";
import { InquirySections, type Draft, type Held, type SupportThread } from "./Admin";
import { groupImageUrl, groupUrl } from "../lib/groupLink";
import { listName } from "../lib/data";
import { PageTitle } from "../components/ui";
import { Segmented } from "../components/Choice";
import { ManagedGroup } from "./guess/Account";
import { useSession } from "./guess/useCrowd";

/**
 * מסך "ניהול קבוצה" — לשונית בסרגל רק למנהלי קבוצה. בראש: תמונת מצב (רשומים, השערות, כניסות דרך הקישור);
 * אחריה מצב ההשערות של החברים מול טווח הסקרים (כולל חריגות), הפניות של החברים לצוות האתר, ובסוף כלי הניהול.
 * הכול מצטבר בלבד ומ-50 רשומים (השרת אוכף) — בלי פרט על חבר מסוים. ניטרלי: בלי צבעי מפלגות, צבע רק למצב.
 */
export default function GroupAdmin() {
  const session = useSession();
  const { me, token } = session;
  const groups = me?.managedGroups ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const g = groups.find((x) => x.id === picked) ?? groups[0];
  if (!token) return <Empty>כדי לנהל קבוצה צריך להיכנס לחשבון. <Link to="/account">לכניסה</Link></Empty>;
  if (!me) return <p className="text-ink-soft">טוען…</p>;
  if (!g) return <Empty>החשבון הזה אינו מנהל קבוצה. מנהל האתר ממנה מנהלי קבוצה לפי מייל מאומת.</Empty>;
  return (
    <div className="space-y-6 max-w-5xl">
      <PageTitle>ניהול קבוצה</PageTitle>
      {groups.length > 1 && <Segmented label="הקבוצה" value={g.id} onChange={(id: string) => setPicked(id)} options={groups.map((x) => ({ id: x.id, label: x.name ?? x.id }))} />}
      <GroupView key={g.id} id={g.id} name={g.name ?? g.id} slug={g.slug} image={g.image} members={g.members} token={token} onChanged={() => void session.refresh()} />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="space-y-3"><PageTitle>ניהול קבוצה</PageTitle><p className="text-ink-soft">{children}</p></div>;
}

const n = (v: number) => v.toLocaleString("he-IL");
const q = (id: string) => encodeURIComponent(id);

function GroupView({ id, name, slug, image, members, token, onChanged }: { id: string; name: string; slug?: string | null; image?: string | null; members?: number; token: string; onChanged: () => void }) {
  const [series, setSeries] = useState<GroupSeries | null>(null);
  const [ins, setIns] = useState<GroupInsights | null>(null);
  const [link, setLink] = useState<GroupLinkStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.allSettled([
      call<GroupSeries>(`/group/series?group=${q(id)}`, { token }),
      call<GroupInsights>(`/group/insights?group=${q(id)}`, { token }),
      call<GroupLinkStats>(`/group/link-stats?group=${q(id)}`, { token }),
    ]).then(([s, i, l]) => {
      if (!live) return;
      if (l.status === "fulfilled") setLink(l.value);
      if (s.status === "fulfilled") setSeries(s.value);
      if (i.status === "fulfilled") setIns(i.value);
      setFailed(s.status === "rejected" && i.status === "rejected");
    });
    return () => { live = false; };
  }, [id, token]);
  const img = image ? groupImageUrl({ id }, image) : null;
  return (
    <>
      <header className="flex items-center gap-4">
        {img && <img src={img} alt="" className="w-14 h-14 rounded-theme object-cover border border-paper-line" />}
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight truncate">{name}</p>
          <p className="text-sm text-ink-soft">{slug ? <a href={groupUrl(slug)} dir="ltr" className="underline">{groupUrl(slug).replace(/^https?:\/\//, "")}</a> : "אין עדיין קישור לקבוצה"}</p>
        </div>
      </header>
      {failed && <p className="text-sm text-ink-soft">הנתונים אינם זמינים כרגע. כלי הניהול למטה פועלים.</p>}
      {/* כל חלק במגירה (הכרעת בעלים 25.10.2026): כל המספרים בסטטיסטיקה בראש המסך, כל נושא הניחושים במגירה אחת — בלי נתון כפול */}
      <div className="space-y-3">
        <Section title="סטטיסטיקה" open aside={series ? hourlyNote(series) : undefined}>
          <Measures data={series} failed={failed} />
          {link && <Sub title="כניסות דרך הקישור (דפדפנים, בלי חשבון)">
            <div className="grid grid-cols-3 gap-3">
              <Tile label="בסך הכול" value={n(link.opens)} />
              <Tile label="היום" value={n(link.today)} />
              <Tile label="דפדפנים שונים" value={n(link.fresh)} />
            </div>
          </Sub>}
          {ins && !ins.belowMin && <Questions q={ins.questions} />}
          {ins?.belowMin && <p className="text-sm text-ink-soft">פחות מ-{ins.min} חברים מהקבוצה רשומים באתר. מצב הניחושים והפניות יוצגו מ-{ins.min} רשומים, כדי שלא יתגלה מה עשה חבר מסוים.</p>}
        </Section>
        <Section title="ניחושים">
          {ins && !ins.belowMin && <Guesses ins={ins} />}
          <CompareSwitch id={id} token={token} />
          <Sub title="אישור ניחושים">
            <AdminGuesses group={{
              load: () => call(`/group/guesses?group=${q(id)}`, { token }),
              decide: (body) => call("/group/guesses/decide", { token, body: { group: id, ...body } }),
            }} />
          </Sub>
        </Section>
        <SupportThreads id={id} token={token} />
        <Section title="כלי ניהול">
          <ManagedGroup id={id} name={name} slug={slug} image={image} members={members} token={token} className="space-y-0" onChanged={onChanged} tools />
        </Section>
      </div>
    </>
  );
}

type SupportData = Parameters<typeof InquirySections>[0]["data"] & { salt: string; belowMin?: undefined };
/**
 * פניות החברים לצוות האתר — אותו ממשק כמו למנהל האתר (הכרעת בעלים 25.10.2026): תשובה, טיוטות לאישור, השהיות.
 * בלי שם או מזהה: כל שיחה מזוהה בידית חד-פעמית מהטעינה. תשובה של מנהל הקבוצה מוצגת לחבר כתשובת צוות האתר.
 */
function SupportThreads({ id, token }: { id: string; token: string }) {
  const [d, setD] = useState<SupportData | { belowMin: true; min: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try { const r = await call<{ belowMin?: boolean; min: number; salt: string; threads: SupportThread[]; drafts: Draft[]; held: Held[] }>(`/group/support?group=${q(id)}`, { token });
      setD(r.belowMin ? { belowMin: true, min: r.min } : { salt: r.salt, days: [], totalVisitors: 0, feedback: [], support: { stats: {}, threads: r.threads }, drafts: r.drafts, held: r.held }); setError(null); }
    catch { setError("השיחות אינן זמינות כרגע."); }
  };
  useEffect(() => { void load(); }, [id, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (handle: string, body: Record<string, unknown>) => {
    if (!d || "belowMin" in d && d.belowMin) return false;
    try { await call("/group/support/act", { token, body: { group: id, salt: (d as SupportData).salt, handle, ...body } }); await load(); return true; }
    catch { setError("הפעולה לא הצליחה. נסו שוב."); return false; }
  };
  const target = (draftId: number) => (d && !("belowMin" in d && d.belowMin) ? (d as SupportData).drafts?.find((x) => x.id === draftId)?.target : undefined) ?? "";
  return (
    <Section title="פניות החברים לצוות האתר" lead="כל 4 שעות Claude סורק את הפניות ועונה לפי מדיניות האתר. תשובה שאינה עומדת במדיניות נשמרת כטיוטה לאישור — כאן או אצל מנהל האתר. אפשר גם לענות בעצמכם; התשובה מוצגת לחבר כתשובת צוות האתר.">
      {error && <p className="text-sm text-warn">{error}</p>}
      {!d ? (!error && <p className="text-sm text-ink-soft">טוען…</p>)
        : "belowMin" in d && d.belowMin ? <p className="text-sm text-ink-soft">השיחות יוצגו מ-{d.min} חברים רשומים.</p>
        : <InquirySections data={d as SupportData} reply={(_kind, handle) => (text) => act(String(handle), { action: "reply", text })} draftActions={{
            approve: (draftId, text) => act(target(draftId), { action: "approve", draft: draftId, text }),
            remove: (draftId) => act(target(draftId), { action: "delete", draft: draftId }),
            release: (_kind, handle) => act(handle, { action: "release" }),
          }} />}
    </Section>
  );
}

/** למה משווים את ממוצע הניחושים של הקבוצה במסך "ממוצע הניחושים" של החברים (הכרעת בעלים 24.10.2026) */
function CompareSwitch({ id, token }: { id: string; token: string }) {
  const [value, setValue] = useState<GroupCompare | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void call<{ compare: GroupCompare }>(`/group/compare?group=${q(id)}`, { token }).then((r) => setValue(r.compare), () => setValue(null)); }, [id, token]);
  if (!value) return null;
  const change = async (next: GroupCompare) => {
    if (next === value) return;
    setBusy(true);
    try { setValue((await call<{ compare: GroupCompare }>("/group/compare", { token, body: { group: id, compare: next } })).compare); } finally { setBusy(false); }
  };
  return (
    <Sub title="השוואה בממוצע הניחושים">
      <p className="text-sm text-ink-soft">חברי הקבוצה רואים את ממוצע הניחושים של הקבוצה לצד:</p>
      <Segmented label="השוואת ממוצע הקבוצה" value={value} disabled={busy} onChange={(v: GroupCompare) => void change(v)} options={[{ id: "polls", label: "ממוצע הסקרים" }, { id: "crowd", label: "ממוצע כל המשתתפים" }]} />
    </Sub>
  );
}

/** מגירה במסך (הכרעת בעלים 25.10.2026): כל חלק מקופל; open = פתוח בכניסה */
function Section({ title, aside, lead, open = false, children }: { title: string; aside?: ReactNode; lead?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group/s bg-paper-card border border-paper-line rounded-theme px-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[56px]">
        <span className="min-w-0 py-3"><span className="flex items-baseline gap-3 min-w-0"><h2 className="font-bold text-lg">{title}</h2>{aside && <span className="text-xs text-ink-soft truncate">{aside}</span>}</span>{lead && <span className="block text-xs text-ink-soft mt-1">{lead}</span>}</span>
        <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open/s:rotate-45">+</span>
      </summary>
      <div className="space-y-4 pb-4">{children}</div>
    </details>
  );
}

/** כותרת משנה בתוך מגירה */
function Sub({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <div className="space-y-2 pt-3 border-t border-paper-line first:border-t-0 first:pt-0"><div className="flex items-baseline justify-between gap-3"><h3 className="font-bold">{title}</h3>{aside && <span className="text-xs text-ink-soft">{aside}</span>}</div>{children}</div>;
}

/** מתי מתחיל החלק השעתי של הגרפים */
function hourlyNote(d: GroupSeries) {
  const first = d.buckets.find((b) => b.hourly);
  return first ? `גרפים: שעתי מ-${bucketLabel(first)}, יומי לפני כן` : undefined;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-paper border border-paper-line rounded-theme p-3 min-w-0">
      <p className="text-xs text-ink-soft truncate">{label}</p>
      <p className="font-num tabular text-3xl leading-none mt-1">{value}</p>
      {sub && <p className="text-xs text-ink-soft mt-1">{sub}</p>}
    </div>
  );
}

/** שבעת המדדים (הכרעת בעלים 24.10.2026), בסדר הזה. "מהרשימה" = חשבון שמייל מאומת שלו ברשימת המיילים של הקבוצה */
const MEASURES: { key: GroupSeriesKey; label: string; group: "list" | "outside" }[] = [
  { key: "list", label: "מיילים ברשימה", group: "list" },
  { key: "linkFirst", label: "נכנסו דרך הקישור", group: "list" },
  { key: "registered", label: "נרשמו לאתר", group: "list" },
  { key: "seats", label: "שמרו ניחוש", group: "list" },
  { key: "vote", label: "שמרו הצבעה", group: "list" },
  { key: "outsideLink", label: "נכנסו דרך הקישור", group: "outside" },
  { key: "outsideFirst", label: "הקישור היה הכניסה הראשונה שלהם לאתר", group: "outside" },
];

function Measures({ data, failed }: { data: GroupSeries | null; failed: boolean }) {
  if (!data) return failed ? null : <p className="text-sm text-ink-soft">טוען…</p>;
  const by = new Map(data.series.map((s) => [s.key, s]));
  const list = by.get("list")?.total ?? 0;
  const card = (m: (typeof MEASURES)[number], i: number) => {
    const s = by.get(m.key);
    const pct = m.group === "list" && m.key !== "list" && s?.total != null && list ? `${Math.round((100 * s.total) / list)}% מהרשימה` : null;
    return (
      <li key={m.key} className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm min-w-0"><span className="text-ink-soft font-num tabular">{i + 1}.</span> {m.label}</p>
          <p className="text-end shrink-0"><span className="font-num tabular text-2xl leading-none">{s?.total != null ? n(s.total) : "—"}</span>{pct && <span className="block text-xs text-ink-soft">{pct}</span>}</p>
        </div>
        {m.key === "list" ? null : s?.points ? <GroupSeriesChart buckets={data.buckets} points={s.points} label={m.label} /> : <p className="text-xs text-ink-soft">פחות מ-{data.min} — המספר והגרף יוצגו מ-{data.min}.</p>}
      </li>
    );
  };
  return (
    <>
      <Sub title="חברי הקבוצה (מרשימת המיילים)">
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{MEASURES.filter((m) => m.group === "list").map((m) => card(m, MEASURES.indexOf(m)))}</ul>
      </Sub>
      <Sub title="מחוץ לרשימה (נכנסו דרך הקישור)">
        <ul className="grid sm:grid-cols-2 gap-3">{MEASURES.filter((m) => m.group === "outside").map((m) => card(m, MEASURES.indexOf(m)))}</ul>
      </Sub>
    </>
  );
}

/** מצב ההשערות: פס אחד לפי מצב (תקינה / חריגה שאושרה / ממתינה / נדחתה), ובטבלה — רשימות שהחברים חרגו בהן מטווח הסקרים */
function Guesses({ ins }: { ins: Extract<GroupInsights, { belowMin?: undefined }> }) {
  const parts: { key: keyof typeof ins.status; label: string; cls: string }[] = [
    { key: "inRange", label: "בטווח הסקרים", cls: "bg-ink" },
    { key: "approved", label: "חריגות שאושרו", cls: "bg-ink-soft" },
    { key: "pending", label: "ממתינות לאישור", cls: "bg-warn" },
    { key: "rejected", label: "נדחו", cls: "bg-paper-line" },
  ];
  const total = ins.guesses || 1;
  const rows = [...ins.outside].sort((a, b) => b.above + b.below - (a.above + a.below));
  return (
    <Sub title="מצב הניחושים" aside={`${n(ins.guesses)} ניחושים`}>
      <div className="flex h-3 rounded-full overflow-hidden bg-paper border border-paper-line" role="img" aria-label={parts.map((p) => `${p.label}: ${ins.status[p.key]}`).join(", ")}>
        {parts.map((p) => ins.status[p.key] > 0 && <span key={p.key} className={p.cls} style={{ width: `${(100 * ins.status[p.key]) / total}%` }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => <li key={p.key} className="flex items-center gap-2"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 border border-paper-line ${p.cls}`} /><span className="flex-1">{p.label}</span><strong className="font-num tabular">{n(ins.status[p.key])}</strong></li>)}
      </ul>
      {ins.status.pending > 0 && <p className="text-xs text-ink-soft">ניחוש ממתין אינו נספר בממוצע הקבוצה עד שמנהל האתר או מנהל הקבוצה יאשר אותו. הוא חוזר לבד להיות רגיל אם הסקרים מתקרבים אליו.</p>}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-start font-bold pb-1">מחוץ לטווח הסקרים, לפי רשימה</caption>
            <thead className="text-xs text-ink-soft"><tr><th className="text-start font-normal py-1">רשימה</th><th className="font-normal">טווח הסקרים</th><th className="font-normal">מעל</th><th className="font-normal">מתחת</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.list} className="border-t border-paper-line">
                  <td className="py-1.5">{listName(r.list)}</td>
                  <td className="text-center font-num tabular" dir="ltr">{r.lo}–{r.hi}</td>
                  <td className="text-center font-num tabular">{r.above ? n(r.above) : "—"}</td>
                  <td className="text-center font-num tabular">{r.below ? n(r.below) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-soft pt-1">כל ניחוש שרשימה בה נמצאת מעל הסקר הגבוה או מתחת לנמוך. רק חריגה גדולה ממתינה לאישור.</p>
        </div>
      ) : <p className="text-sm text-ink-soft">כל הניחושים בתוך טווח הסקרים.</p>}
    </Sub>
  );
}

const TOPIC_LABEL: Record<string, string> = { data: "תיקון נתון", idea: "רעיון לשיפור", theory: "שאלה או תאוריה", other: "אחר" };

/** פניות החברים לצוות האתר: כמה פנו, כמה הודעות (ובשבוע האחרון), לפי נושא, וכמה השתמשו בצ׳אט החכם. בלי תוכן */
function Questions({ q: d }: { q: Extract<GroupInsights, { belowMin?: undefined }>["questions"] }) {
  if (!d) return <Sub title="שאלות ופניות"><p className="text-sm text-ink-soft">המספרים אינם זמינים כרגע.</p></Sub>;
  const topics = Object.entries(d.byTopic).filter(([, v]) => v);
  return (
    <Sub title="שאלות ופניות לצוות האתר">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="פנו לצוות" value={n(d.askers)} />
        <Tile label="הודעות" value={n(d.messages)} sub={`${n(d.week)} בשבוע האחרון`} />
        <Tile label="בצ׳אט החכם" value={n(d.aiUsers)} />
      </div>
      {topics.length > 0 && (
        <ul className="text-sm space-y-1">
          {topics.map(([k, v]) => <li key={k} className="flex justify-between gap-3 border-t border-paper-line pt-1"><span>{TOPIC_LABEL[k] ?? k}</span><strong className="font-num tabular">{n(v!)}</strong></li>)}
        </ul>
      )}
      <p className="text-xs text-ink-soft">מספר גבוה בנושא מסוים — סימן שכדאי להסביר אותו לקבוצה.</p>
    </Sub>
  );
}
