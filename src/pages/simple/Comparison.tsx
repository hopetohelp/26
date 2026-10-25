import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { call, CrowdError, type Dashboard, type GroupDashboard, type GroupPublic, type SeatsPayload } from "../../lib/crowdApi";
import { seatsSum, validateSeats } from "../../lib/crowdValidate";
import { useInterface } from "../../lib/interfaceMode";
import { HAGZARA_GROUP_ID, simpleValue } from "../../lib/simpleSources";
import { useCrowdDashboard } from "../../lib/sources";
import { SAVED_EVENT } from "../../lib/outbox";
import { IDS, startSeats } from "../guess/model";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { VotingStats } from "../guess/Dashboard";
import CardDrawer from "../../components/CardDrawer";
import { BlocChart, FocusFoot, InlineBlocBar, LegendCapsule, LegendLine, LegendBox, PartyChart, SourceBar, orderedLists, useSimpleSource } from "./shared";
import ShareCard from "./ShareCard";
import { useHagzara } from "./hagzara";

const meansOf = (d: Dashboard | null | undefined) => Object.fromEntries((d?.seats?.full ?? []).map(r => [r.list, r.mean]));
const EMPTY = startSeats("zero");
/** הכנסת הממוצעת: נפתחת אחרי שמירת הכנסת שלך במלואה. ממוצע המשתתפים, ולחברי הגזרה — הגזרה במקום ממוצע הסקרים. */
export default function Comparison(_props: { landing?: GroupPublic | null }) {
  const session = useSession();
  const { setLanding } = useInterface();
  const source = useSimpleSource(true, true);
  const crowd = useCrowdDashboard();
  const hagzara = useHagzara(session);
  const member = session.me?.groups?.find(g => g.id === HAGZARA_GROUP_ID);
  const seats = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const mine = seats.draft ?? EMPTY;
  const unlocked = seats.status === "saved" && !validateSeats(mine, IDS);
  const [result, setResult] = useState<{ token: string; data: GroupDashboard | null; failed: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
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
  if (!unlocked) {
    const total = seatsSum(mine);
    return <div className="max-w-6xl mx-auto"><h1 className="sr-only">ממוצע הניחושים</h1>
      <div className="f-card f-lock"><p className="text-3xl" aria-hidden="true">🔒</p><h2 className="text-lg font-bold my-2">ממוצע הניחושים נפתח אחרי שמירת הכנסת שלך</h2>
        <p className="text-ink-soft mb-4">ממלאים את כל 120 המנדטים, שומרים, ורואים איך כולם חושבים.</p>
        <InlineBlocBar values={Object.fromEntries(IDS.map(id => [id, mine.seats[id]?.v ?? 0]))} missing={Math.max(0, 120 - total)} />
        <Link to="/guess" className="f-btn pri mt-5">להשלמת הניחוש שלי</Link></div><FocusFoot /></div>;
  }
  const response = allowed && result?.token === session.token ? result : null;
  const raw = response?.data;
  const below = raw?.belowMin ? raw : null;
  const group = raw && !raw.belowMin ? raw as Dashboard : null;
  const all = crowd.dashboard;
  const crowdMeans = meansOf(all), groupMeans = meansOf(group);
  const polls = (id: string) => simpleValue(source.selection, [id]);
  const lists = orderedLists(source.selection, [groupMeans], crowdMeans);
  const blocValues = member ? groupMeans : crowdMeans;
  const hagzaraLogo = hagzara?.logoUrl ?? null;
  const voters = member ? group : all;
  // חברי הקבוצה: ממוצע הקבוצה מול ממוצע הסקרים או מול כל המשתתפים — לפי בחירת מנהל הקבוצה (הכרעת בעלים 24.10.2026)
  const vsPolls = (raw?.compare ?? "polls") === "polls";
  // השוואה לממוצע הניחושים: הסרגל בוחר טווח (כל הסקרים / 14 ו־i24 / הניחושים). "טווח הניחושים" = מינימום, רבעונים ומקסימום של כל המשתתפים
  const ranges = !!member && !vsPolls;
  const crowdRange = ranges && source.key === "crowd";
  const crowdRows = new Map((all?.seats?.full ?? []).map(r => [r.list, r]));
  const crowdSpread = (id: string): [number, number, number, number, number, number] | null => { const r = crowdRows.get(id); return r ? [r.min, r.p25, r.p25, r.p75, r.p75, r.max] : null; };
  return <div className="max-w-6xl mx-auto"><h1 className="sr-only">ממוצע הניחושים</h1>
    {hagzara?.logoUrl && <img src={hagzara.logoUrl} alt="הגזרה" className="f-gphone" />}
    <SourceBar source={source} ranges={ranges} />
    {crowd.failed && !all && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    {response?.failed && <Notice>נתוני הגזרה אינם זמינים כרגע.</Notice>}
    {below && <Notice>נתוני הגזרה יוצגו אחרי {below.min} משתתפים.</Notice>}
    <div className="f-grid">
      <PartyChart selection={source.selection} lists={lists} spreadOf={crowdRange ? crowdSpread : undefined}
        marks={id => member && !vsPolls ? [{ value: crowdMeans[id], side: "up" }, { value: groupMeans[id], kind: "dash", side: "down" }] : member ? [{ value: polls(id), kind: "soft", side: "up" }, { value: groupMeans[id], kind: "dash", side: "down" }] : [{ value: polls(id), kind: "soft", side: "up" }, { value: crowdMeans[id], side: "down" }]}
        legend={<><LegendCapsule label={crowdRange ? "טווח הניחושים" : "טווח הסקרים"} />{(!member || vsPolls) && <LegendLine kind="soft" label="ממוצע הסקרים" />}{(!member || !vsPolls) && <LegendBox label="משתתפים" n={all?.seats?.n} />}{member && <LegendBox kind="dash" label="הגזרה" n={group?.seats?.n} />}</>} />
      <div className="f-side"><BlocChart values={blocValues} logo={hagzaraLogo} />
        {voters && <CardDrawer title="התפלגות המצביעים" open={votersOpen} onOpenChange={setVotersOpen} seenId="voters" className="mt-5"><VotingStats d={voters} /></CardDrawer>}</div>
    </div>
    <div className="flex justify-center mt-5"><button type="button" className="f-btn pri" onClick={() => setSharing(true)} disabled={!Object.keys(blocValues).length}>שיתוף ממוצע הניחושים</button></div>
    <FocusFoot />
    {sharing && <ShareCard heading="שיתוף ממוצע הניחושים" input={{ kind: "average", values: blocValues, group: hagzara }} onClose={() => setSharing(false)} />}
  </div>;
}
