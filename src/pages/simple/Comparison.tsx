import { useEffect, useState } from "react";
import { Card, PageTitle } from "../../components/ui";
import Explained from "../../components/Explained";
import GroupBanner from "../../components/GroupBanner";
import { call, CrowdError, type Dashboard, type GroupDashboard, type GroupPublic } from "../../lib/crowdApi";
import { useInterface } from "../../lib/interfaceMode";
import { HAGZARA_GROUP_ID, simpleValue } from "../../lib/simpleSources";
import { useCrowdDashboard } from "../../lib/sources";
import { SAVED_EVENT } from "../../lib/outbox";
import { DEFAULT_BLOCS, IDS } from "../guess/model";
import { useSession } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { blankDashboard } from "../../lib/groupBlank";
import { PartyName, PollExplanation, SimpleFooter, SimpleSourcePicker, SimpleTable, number, useSimpleSource } from "./shared";
import { date } from "../../lib/format";
const keyOf = (ids: string[]) => [...new Set(ids)].sort().join(",");
/** מזהים הרכב, לא שם או מיקום. האגרגציה הקיימת בשרת כבר מסכמת את הגושים מכל ההשערות. */
export function fixedBlocValue(d: Dashboard | null, lists: string[]) {
  return d?.blocs?.fixed?.find(b => keyOf(b.lists) === keyOf(lists))?.stat?.mean ?? null;
}
export default function Comparison({ landing: direct = null }: { landing?: GroupPublic | null }) {
  const session = useSession();
  const { landing, setLanding } = useInterface();
  const source = useSimpleSource();
  const crowd = useCrowdDashboard();
  const member = session.me?.groups?.find(g => g.id === HAGZARA_GROUP_ID);
  const [result, setResult] = useState<{ token: string; data: GroupDashboard | null; failed: boolean } | null>(null);
  const allowed = !!member && !!session.token;
  useEffect(() => { if (member) setLanding({ id: member.id, name: member.name, slug: member.slug ?? "hagzara", image: member.image ?? null }); }, [member?.id, member?.name, member?.slug, member?.image, setLanding]);
  useEffect(() => {
    if (!allowed || !session.token) { setResult(null); return; }
    let live = true;
    const token = session.token;
    const load = async () => {
      try {
        const data = await call<GroupDashboard>(`/dashboard?group=${encodeURIComponent(HAGZARA_GROUP_ID)}`, { token });
        if (live) setResult({ token, data, failed: false });
      } catch (e) {
        if (live) setResult(previous => ({ token, data: e instanceof CrowdError && [401, 403].includes(e.status) ? null : previous?.token === token ? previous.data : null, failed: true }));
        if (e instanceof CrowdError && [401, 403].includes(e.status)) void session.refresh();
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    const focus = () => { void session.refresh(); void load(); };
    window.addEventListener("focus", focus);
    window.addEventListener(SAVED_EVENT, load);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener(SAVED_EVENT, load); };
  }, [allowed, session.token, session.refresh]);
  const response = allowed && result?.token === session.token ? result : null;
  const raw = response?.data;
  const below = raw?.belowMin ? raw : null;
  const group: Dashboard | null = raw ? raw.belowMin ? blankDashboard(raw.participants ?? 0, IDS, {}, null) : raw : null;
  const all = crowd.dashboard;
  const shown = member ?? direct ?? landing;
  const headers = ["סקרים", <span>משתתפים{all?.seats && <small className="block">{all.seats.n} משתתפים</small>}</span>, ...(allowed ? [<span>הגזרה{group && <small className="block">{below ? below.participants ?? 0 : group.seats?.n ?? 0} משתתפים</small>}</span>] : [])];
  const ids = [...new Set([...IDS, ...(all?.seats?.full.map(r => r.list) ?? []), ...(group?.seats?.full.map(r => r.list) ?? [])])].sort((a, b) => (simpleValue(source.selection, [b]) ?? 0) - (simpleValue(source.selection, [a]) ?? 0));
  const value = (d: Dashboard | null, id: string) => d?.seats?.full.find(r => r.list === id)?.mean ?? null;
  return <div className="simple-page max-w-4xl mx-auto"><PageTitle>הכנסת הממוצעת</PageTitle>
    {shown && <GroupBanner showName id={shown.id} name={shown.name} image={shown.image} />}
    <p className="text-sm text-ink-soft mb-4">השערות המשתתפים אינן סקר.</p><SimpleSourcePicker source={source} />
    {crowd.failed && !all && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    {response?.failed && <Notice>נתוני הגזרה אינם זמינים כרגע. נתוני כלל המשתתפים מוצגים בנפרד.</Notice>}
    {below && <Notice>נתוני הגזרה יוצגו אחרי {below.min} משתתפים. עד אז טור הגזרה מוצג עם אפסים.</Notice>}
    <PollExplanation><Explained kind="השערות משתתפים, אינן סקר" source="צבירת ההשערות הקיימת בשרת, כלל המשתתפים וחברי הגזרה בנפרד" asOf={all?.publishedAt ? date(all.publishedAt) : "הפרסום האחרון"} assumption="השערה אחרונה לכל משתתף לפי כללי ההכללה והסף הקיימים" methodAnchor="crowd">
      <SimpleTable label="השוואת הכנסת הממוצעת" headers={headers} rows={ids.map(id => ({ id, label: <PartyName id={id} />, cells: [number(simpleValue(source.selection, [id])), number(value(all, id)), ...(allowed ? [number(value(group, id))] : [])] }))} />
      <Card title="החלוקה לגושים"><SimpleTable label="חלוקה לגושים" headers={headers} rows={DEFAULT_BLOCS.blocs.map(b => ({ id: b.id, label: b.name, cells: [number(simpleValue(source.selection, b.lists)), number(fixedBlocValue(all, b.lists)), ...(allowed ? [number(below ? 0 : fixedBlocValue(group, b.lists))] : [])] }))} /></Card>
    </Explained></PollExplanation><SimpleFooter /></div>;
}
