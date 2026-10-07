import { useEffect, useState, type ReactNode } from "react";
import Explained from "../../components/Explained";
import { Card, ChartWithTable, Fold } from "../../components/ui";
import { call, type Cell, type Dashboard as D, type LogEntry, type SeatStat } from "../../lib/crowdApi";
import { dateLong, seatsFmt } from "../../lib/format";
import { IDS, k25Name, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
import { Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

const GUESS = "השערות גולשים, אינן סקר" as const;
const VOTE = "תשובות גולשים במדגם עצמי, לא מייצג, ללא דגימה וללא שקלול" as const;
const when = (iso: string | null) =>
  iso === null ? "עוד לא פורסם" : `${dateLong(iso)}, ${new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`;
const v2026Name = (k: string) => V2026_LABEL[k] ?? nameOf(k);
const v2022Name = (k: string) => V2022_LABEL[k] ?? k25Name(k);
/** "נכון ל-" של חלק: מועד הפרסום שלו, ואם אין — של הדשבורד כולו */
const at = (d: D, section: string) => d.sectionsAsOf?.[section] ?? d.publishedAt;
const pctOf = (c: Cell) => (c.of ? Math.round((c.n / c.of) * 1000) / 10 : 0);

function Ex({ kind, asOf, children, n }: { kind: typeof GUESS | typeof VOTE; asOf: string | null; children: ReactNode; n: string }) {
  return (
    <Explained kind={kind} source={`ההשערות באתר — הגרסה האחרונה של כל משתתף (${n})`} asOf={when(asOf)} assumption="מי שבחר להשתתף אינו מדגם מייצג של הבוחרים. הנתונים מוצגים גם עבור משתתף יחיד; בקבוצה קטנה אפשר ללמוד מהם את תשובתו, ללא שם." methodAnchor="crowd">
      {children}
    </Explained>
  );
}

function Sorter({ alpha, setAlpha, metric }: { alpha: boolean; setAlpha: (a: boolean) => void; metric: string }) {
  return (
    <div className="flex gap-1.5 text-xs mb-3" role="radiogroup" aria-label="מיון">
      {[
        [false, `לפי ${metric}`],
        [true, "לפי א-ב"],
      ].map(([a, l]) => (
        <button key={String(a)} type="button" role="radio" aria-checked={alpha === a} onClick={() => setAlpha(a as boolean)} className={`min-h-[36px] px-3 rounded-full border ${alpha === a ? "bg-ink text-paper-card border-ink" : "border-paper-line"}`}>
          {l as string}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ session }: { session: ReturnType<typeof useSession> }) {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!session.online) return;
    call<D>("/dashboard").then(setD).catch((e) => setErr(errorText(e)));
  }, [session.online]);

  if (!session.online) return <Notice>הדשבורד יוצג כשהחיבור לשרת יהיה פעיל. בינתיים — אפשר לבנות את ההשערה שלכם בלשונית "שלי".</Notice>;
  if (err) return <Notice tone="warn">{err}</Notice>;
  if (!d) return <p className="text-ink-soft">טוען…</p>;

  return (
    <div>
      <div className="mb-4">
        <Notice tone="warn">{d.participants < 30 ? "מעט משתתפים — הנתונים אינם מייצגים את הציבור." : "השערות הגולשים אינן מדגם מייצג."}</Notice>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        {d.participants} משתתפים · {d.publishedAt ? `נכון ל-${when(d.publishedAt)}` : "עוד לא פורסם"}.
      </p>
      {!d.seats && <Notice>עדיין לא נשמרו השערות מנדטים לפרסום. הממוצע יוצג כבר מההשערה הראשונה; אפשר להשתתף בלשונית "שלי".</Notice>}
      {d.seats && <SeatsBlock d={d} />}
      {d.blocs && <BlocsBlock d={d} />}
      {d.vote2026 && <Vote2026 d={d} />}
      {d.vote2022 && <Vote2022 d={d} />}
      {d.matrix && <Matrix d={d} />}
      {d.byVote && <ByVote d={d} />}
      {d.trend && d.trend.length > 0 && <Trend d={d} />}
      {d.underReview && d.underReview.participants > 0 && (
        <Fold title="בבדיקה — מוצג בנפרד">
          <p className="text-sm mb-2">{d.underReview.participants} משתתפים הצטרפו בשעה חריגה. הם אינם בממוצע הראשי עד להכרעה, שנרשמת ביומן.</p>
          <StatTable rows={d.underReview.seats} polls={{}} />
        </Fold>
      )}
      <Fold title="על הנתונים">
        <p className="text-sm">{GUESS}. כוונות ההצבעה — {VOTE}. מספר משתתפים קטן אינו מאפשר להסיק על תוצאות הבחירות.</p>
      </Fold>
      <LogFold />
    </div>
  );
}

function Band({ s, max, poll }: { s: SeatStat; max: number; poll?: number }) {
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="relative h-5 rounded-full bg-paper" aria-hidden="true">
      <div className="absolute inset-y-1 rounded-full bg-ink/25" style={{ insetInlineStart: x(s.p25), width: `calc(${x(s.p75 - s.p25)} + 4px)` }} />
      <div className="absolute inset-y-0 w-1 rounded-full bg-ink" style={{ insetInlineStart: x(s.median) }} />
      {poll !== undefined && <div className="absolute -inset-y-0.5 w-0.5 bg-accent" style={{ insetInlineStart: x(poll) }} title="ממוצע הסקרים" />}
    </div>
  );
}

function StatTable({ rows, polls }: { rows: SeatStat[]; polls: Record<string, number> }) {
  return (
    <table className="w-full text-sm tabular">
      <thead>
        <tr className="text-ink-soft">
          <th className="text-start font-normal">רשימה</th>
          <th className="font-normal">חציון</th>
          <th className="font-normal">טווח אמצעי (25–75)</th>
          <th className="font-normal">ממוצע</th>
          <th className="font-normal">סקרים</th>
          <th className="font-normal">n</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.list} className="border-t border-paper-line">
            <td className="py-1">{nameOf(s.list)}</td>
            <td className="text-center font-bold">{seatsFmt(s.median)}</td>
            <td className="text-center"><bdi dir="ltr">{seatsFmt(s.p25)}–{seatsFmt(s.p75)}</bdi></td>
            <td className="text-center">{seatsFmt(Math.round(s.mean * 10) / 10)}</td>
            <td className="text-center">{polls[s.list] ?? "—"}</td>
            <td className="text-center">{s.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeatsBlock({ d }: { d: D }) {
  const s = d.seats!;
  const [manual, setManual] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const rows = [...(manual ? s.manual : s.full)].sort((a, b) => (alpha ? nameOf(a.list).localeCompare(nameOf(b.list), "he") : b.median - a.median || b.p75 - a.p75));
  const max = Math.max(10, ...rows.map((r) => r.p75), ...Object.values(s.polls)) + 2;
  return (
    <Card title="הכנסת של הגולשים">
      <Ex kind={GUESS} asOf={at(d, "seats")} n={`${s.n} משתתפים`}>
        <div className="flex gap-1.5 text-xs mb-2 flex-wrap" role="radiogroup" aria-label="מי נספר">
          {[
            [false, "כל ההשערות"],
            [true, "בקרב מי שקבעו ערך לרשימה"],
          ].map(([m, l]) => (
            <button key={String(m)} type="button" role="radio" aria-checked={manual === m} onClick={() => setManual(m as boolean)} className={`min-h-[36px] px-3 rounded-full border ${manual === m ? "bg-ink text-paper-card border-ink" : "border-paper-line"}`}>
              {l as string}
            </button>
          ))}
        </div>
        {manual && <p className="text-xs text-ink-soft mb-2">לכל רשימה n משלה — רק מי שקבע לה ערך בעצמו. לכן אין כאן סכום ואין דירוג.</p>}
        {!manual && <Sorter alpha={alpha} setAlpha={setAlpha} metric="חציון" />}
        <ChartWithTable
          summary={`הקו העבה = החציון; הפס = מחצית ההשערות האמצעית; הקו הדק = ממוצע הסקרים${s.pollsAsOf ? ` מ-${dateLong(s.pollsAsOf)}` : ""}.`}
          table={<StatTable rows={rows} polls={s.polls} />}
          chart={
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.list} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2">
                  <span className="text-sm truncate">{nameOf(r.list)}</span>
                  <Band s={r} max={max} poll={manual ? undefined : s.polls[r.list]} />
                  <span className="font-num tabular text-xl text-end">{seatsFmt(r.median)}</span>
                  <span className="sr-only">
                    חציון {seatsFmt(r.median)}, מחצית אמצעית {seatsFmt(r.p25)} עד {seatsFmt(r.p75)}, ממוצע הסקרים {s.polls[r.list] ?? "אין"}, {r.n} משתתפים
                  </span>
                </li>
              ))}
            </ul>
          }
        />
        <p className="text-xs text-ink-soft mt-3">
          {Math.round(s.filledShare * 100)}% מהמנדטים בהשערות הושלמו ב"השלם הכול" · {s.usedFillAll} השתמשו בו · נקודות פתיחה: מאפס {s.starts.zero}, מהסקרים {s.starts.polls}, מ-2022 {s.starts.k25}
        </p>
        {s.modes && (
          <p className="text-xs text-ink-soft mt-1">
            ניחשו לפי מנדטים: {s.modes.seats} · לפי אחוזי הצבעה: {s.modes.pct} (אצלם המנדטים חושבו לפי החוק)
          </p>
        )}
        {s.pctStats && <PctStats rows={s.pctStats} />}
      </Ex>
    </Card>
  );
}

/** אחוזי ההצבעה שניחשו מי שבחרו "לפי אחוזי הצבעה" (מתפרסם כבר מהתשובה הראשונה) */
function PctStats({ rows }: { rows: SeatStat[] }) {
  const sorted = [...rows].sort((a, b) => b.median - a.median || b.mean - a.mean);
  return (
    <div className="mt-4">
      <h3 className="font-bold text-sm mb-1">לפי אחוזי הצבעה ({rows[0]?.n ?? 0} משתתפים)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular">
          <caption className="sr-only">אחוזי ההצבעה שניחשו הגולשים, בקרב מי שניחשו לפי אחוזים</caption>
          <thead>
            <tr className="text-ink-soft">
              <th className="text-start font-normal py-1">רשימה</th>
              <th className="font-normal">חציון</th>
              <th className="font-normal">25–75</th>
              <th className="font-normal">ממוצע</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.list} className="border-t border-paper-line">
                <td className="py-1">{nameOf(r.list)}</td>
                <td className="text-center font-bold"><bdi dir="ltr">{r.median.toFixed(1)}%</bdi></td>
                <td className="text-center"><bdi dir="ltr">{r.p25.toFixed(1)}–{r.p75.toFixed(1)}%</bdi></td>
                <td className="text-center"><bdi dir="ltr">{r.mean.toFixed(1)}%</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlocsBlock({ d }: { d: D }) {
  const b = d.blocs!;
  const row = (label: string, s: SeatStat | null | undefined) =>
    s ? (
      <tr className="border-t border-paper-line">
        <td className="py-1">{label}</td>
        <td className="text-center font-bold">{seatsFmt(s.median)}</td>
        <td className="text-center"><bdi dir="ltr">{seatsFmt(s.p25)}–{seatsFmt(s.p75)}</bdi></td>
        <td className="text-center">{s.n}</td>
      </tr>
    ) : null;
  const table = (title: string, gov?: SeatStat | null, rest?: SeatStat | null) => (
    <table className="w-full text-sm tabular mb-3">
      <caption className="text-start font-bold mb-1">{title}</caption>
      <thead>
        <tr className="text-ink-soft"><th className="text-start font-normal">גוש</th><th className="font-normal">חציון</th><th className="font-normal">25–75</th><th className="font-normal">n</th></tr>
      </thead>
      <tbody>
        {row("מפלגות הממשלה היוצאת", gov)}
        {row("שאר הרשימות", rest)}
      </tbody>
    </table>
  );
  return (
    <Card title="גושים">
      <Ex kind={GUESS} asOf={at(d, "blocs")} n="שתי סדרות נפרדות">
        {b.derived && table("סדרה 1: סכום ההשערות לרשימות", b.derived.gov, b.derived.rest)}
        {b.explicit && table("סדרה 2: יעד גוש שהגולשים כתבו במפורש", b.explicit.gov, b.explicit.rest)}
        <p className="text-xs text-ink-soft">שתי הסדרות לא מתמזגות: אחת נגזרת מהמנדטים, השנייה ניחוש ישיר. {b.customCount} משתתפים הגדירו גושים משלהם, והם לא בטבלה הזו.</p>
      </Ex>
    </Card>
  );
}

function CellBars({ cells, name }: { cells: Record<string, Cell>; name: (k: string) => string }) {
  const [alpha, setAlpha] = useState(false);
  const rows = Object.entries(cells).sort(([a, x], [b, y]) => (alpha ? name(a).localeCompare(name(b), "he") : (y.hidden ? -1 : pctOf(y)) - (x.hidden ? -1 : pctOf(x))));
  return (
    <>
      <Sorter alpha={alpha} setAlpha={setAlpha} metric="שיעור" />
      <ul className="space-y-1.5">
        {rows.map(([k, c]) => (
          <li key={k} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-sm">
            <span className="truncate">{name(k)}</span>
            <div className="h-3 rounded-full bg-paper" aria-hidden="true">
              {!c.hidden && <div className="h-full rounded-full bg-ink/70" style={{ width: `${pctOf(c)}%` }} />}
            </div>
            <span className="tabular text-end">{c.hidden ? "—" : `${pctOf(c)}%`}</span>
            <span className="sr-only">{c.hidden ? "נתון לא זמין" : `${c.n} מתוך ${c.of}`}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft mt-2">כל קבוצה שיש בה תשובות מוצגת, גם אם מדובר במשתתף יחיד.</p>
    </>
  );
}

function Vote2026({ d }: { d: D }) {
  const [named, setNamed] = useState(false);
  const cells = named ? d.vote2026!.named : d.vote2026!.all;
  const of = Object.values(cells)[0]?.of ?? 0;
  return (
    <Card title="כוונת הצבעה 2026">
      <Ex kind={VOTE} asOf={at(d, "vote2026")} n={`${of} שענו`}>
        <div className="flex gap-1.5 text-xs mb-2" role="radiogroup" aria-label="מי נספר">
          {[
            [false, "כל מי שענה"],
            [true, "רק מי שציין רשימה"],
          ].map(([m, l]) => (
            <button key={String(m)} type="button" role="radio" aria-checked={named === m} onClick={() => setNamed(m as boolean)} className={`min-h-[36px] px-3 rounded-full border ${named === m ? "bg-ink text-paper-card border-ink" : "border-paper-line"}`}>
              {l as string}
            </button>
          ))}
        </div>
        <CellBars cells={cells} name={v2026Name} />
      </Ex>
    </Card>
  );
}

function Vote2022({ d }: { d: D }) {
  const v = d.vote2022!;
  return (
    <Fold title="ההצבעה ב-2022 — מי השתתף כאן">
      <Ex kind={VOTE} asOf={at(d, "vote2022")} n={`${Object.values(v.all)[0]?.of ?? 0} שענו`}>
        <p className="text-sm mb-2">השוואה לתוצאה הרשמית מראה עד כמה המשתתפים כאן שונים מכלל הבוחרים.</p>
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-ink-soft"><th className="text-start font-normal">רשימה</th><th className="font-normal">כאן (מקולות כשרים)</th><th className="font-normal">רשמי</th></tr>
          </thead>
          <tbody>
            {Object.entries(v.valid).map(([k, c]) => (
              <tr key={k} className="border-t border-paper-line">
                <td className="py-1">{v2022Name(k)}</td>
                <td className="text-center">{c.hidden ? "—" : `${pctOf(c)}%`}</td>
                <td className="text-center">{v.official[k] !== undefined ? `${v.official[k]}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ex>
    </Fold>
  );
}

function Matrix({ d }: { d: D }) {
  const m = d.matrix!;
  const cols = [...new Set(Object.values(m.rows).flatMap((r) => Object.keys(r.cells)))];
  return (
    <Fold title="מאיפה לאן: 2022 ⇐ 2026">
      <Ex kind={VOTE} asOf={d.sectionsAsOf?.matrix ?? m.publishedAt} n="שורה = ההצבעה ב-2022">
        <p className="text-sm mb-2">כל שורה: מי שהצביעו לרשימה ב-2022, ואחוז מהם לכל כוונה ב-2026. כל שורה ותא שיש בהם תשובות מוצגים; "—" מציין נתון לא זמין.</p>
        <div className="overflow-x-auto">
          <table className="text-xs tabular min-w-full">
            <thead>
              <tr>
                <th className="text-start p-1 sticky start-0 bg-paper-card">2022 \ 2026</th>
                {cols.map((c) => (
                  <th key={c} className="p-1 font-normal text-ink-soft whitespace-nowrap">{v2026Name(c)}</th>
                ))}
                <th className="p-1 font-normal">n</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.rows).map(([k, r]) => (
                <tr key={k} className="border-t border-paper-line">
                  <th className="text-start p-1 font-bold whitespace-nowrap sticky start-0 bg-paper-card">{v2022Name(k)}</th>
                  {cols.map((c) => {
                    const cell = r.cells[c];
                    const hidden = r.hidden || !cell || cell.hidden;
                    return <td key={c} className={`p-1 text-center ${hidden ? "text-ink-faint" : ""}`}>{hidden ? "—" : `${pctOf(cell)}%`}</td>;
                  })}
                  <td className="p-1 text-center">{r.hidden ? "—" : r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Ex>
    </Fold>
  );
}

function ByVote({ d }: { d: D }) {
  return (
    <Fold title="ההשערות לפי כוונת ההצבעה">
      <Ex kind={GUESS} asOf={at(d, "byVote")} n="לפי קבוצה">
        <div className="overflow-x-auto">
          <table className="text-xs tabular min-w-full">
            <thead>
              <tr>
                <th className="text-start p-1">מתכוונים להצביע ל…</th>
                {IDS.map((id) => <th key={id} className="p-1 font-normal text-ink-soft whitespace-nowrap">{nameOf(id)}</th>)}
                <th className="p-1">n</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(d.byVote!).map(([k, r]) => (
                <tr key={k} className="border-t border-paper-line">
                  <th className="text-start p-1 whitespace-nowrap">{v2026Name(k)}</th>
                  {IDS.map((id) => <td key={id} className="p-1 text-center">{r.seats[id] !== undefined ? seatsFmt(r.seats[id]) : "—"}</td>)}
                  <td className="p-1 text-center">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Ex>
    </Fold>
  );
}

function Trend({ d }: { d: D }) {
  return (
    <Fold title="איך ההשערות השתנו">
      <Ex kind={GUESS} asOf={at(d, "trend")} n="מצב בסוף כל יום">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-ink-soft"><th className="text-start font-normal">יום</th><th className="font-normal">משתתפים</th><th className="font-normal">חדשים</th><th className="font-normal">שינו</th></tr>
          </thead>
          <tbody>
            {d.trend!.map((t) => (
              <tr key={t.day} className="border-t border-paper-line">
                <td className="py-1">{dateLong(t.day)}</td>
                <td className="text-center">{t.n}</td>
                <td className="text-center">{t.newcomers}</td>
                <td className="text-center">{t.changed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ex>
    </Fold>
  );
}

function LogFold() {
  const [log, setLog] = useState<LogEntry[] | null>(null);
  return (
    <details className="bg-paper-card border border-paper-line rounded-theme mb-5 p-4" onToggle={(e) => (e.currentTarget.open && !log ? call<{ entries: LogEntry[] }>("/log").then((r) => setLog(r.entries)).catch(() => setLog([])) : undefined)}>
      <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">היומן הציבורי: חריגות והכרעות</summary>
      {log === null ? (
        <p className="text-sm text-ink-soft">טוען…</p>
      ) : log.length === 0 ? (
        <p className="text-sm">אין רשומות ביומן.</p>
      ) : (
        <ul className="text-sm space-y-2 mt-2">
          {log.map((l, i) => (
            <li key={i} className="border-t border-paper-line pt-2">
              <span className="font-bold">{when(l.at)}</span> · {l.reason} · {l.participants} משתתפים · {l.decision === "pending" ? "בבדיקה" : l.decision === "excluded" ? "הוחרג" : "הוחזר"}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
