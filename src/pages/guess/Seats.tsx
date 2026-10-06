import { useMemo, useState } from "react";
import Explained from "../../components/Explained";
import { Fold } from "../../components/ui";
import type { BlocsPayload, SeatCell, SeatsPayload } from "../../lib/crowdApi";
import { CROWD_URL } from "../../lib/crowdApi";
import { fillAll, fillErrorText, TOTAL } from "../../lib/fillAll";
import { seatsSum, validateSeats } from "../../lib/crowdValidate";
import { dateLong } from "../../lib/format";
import { K25_MAP, k25Name, IDS, nameOf, POLLS, POLLS_AS_OF, startSeats, THRESHOLD_SEATS } from "./model";
import SaveButton from "./SaveButton";
import SeatBoard from "./SeatBoard";
import Share from "./Share";
import { Btn, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

const START_OPTIONS: { id: SeatsPayload["start"]; title: string; desc: string }[] = [
  { id: "zero", title: "מאפס", desc: "120 מושבים ריקים. אתם מחלקים הכול." },
  { id: "polls", title: "מממוצע הסקרים", desc: `הממוצע נכון ל-${dateLong(POLLS_AS_OF)}. משנים מה שרוצים.` },
  { id: "k25", title: "מתוצאות 2022", desc: `רק לרשימות שרצות שוב באותו הרכב (${Object.keys(K25_MAP).map(nameOf).join(", ")}). שאר הרשימות — ריקות, כי אין להן מקבילה אחת ב-2022.` },
];

export default function Seats({
  unit,
  session,
  blocs,
  crowd,
}: {
  unit: ReturnType<typeof useUnit<SeatsPayload>>;
  session: ReturnType<typeof useSession>;
  blocs: BlocsPayload | null;
  crowd: Record<string, number> | null;
}) {
  const p = unit.draft;
  const [preview, setPreview] = useState<ReturnType<typeof fillAll> | null>(null);
  const [resetAsk, setResetAsk] = useState(false);
  const values = useMemo(() => Object.fromEntries(IDS.map((id) => [id, p?.seats[id]?.v ?? 0])), [p]);

  if (!p) {
    return (
      <div>
        <h2 className="font-display text-4xl leading-none mb-1">מאיפה מתחילים?</h2>
        <p className="text-ink-soft text-sm mb-4">בונים כנסת של 120. בוחרים נקודת פתיחה, ומשם כל מנדט בידיים שלכם.</p>
        <div className="grid sm:grid-cols-3 gap-3 [&>*]:min-w-0">
          {START_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => unit.setDraft(startSeats(o.id))}
              className="text-start bg-paper-card border-2 border-paper-line hover:border-ink rounded-theme p-4 min-h-[44px]"
            >
              <span className="font-display text-3xl leading-none block mb-1">{o.title}</span>
              <span className="text-sm text-ink-soft leading-relaxed block">{o.desc}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 opacity-80">
          <SeatBoard values={{}} />
        </div>
      </div>
    );
  }

  const sum = seatsSum(p);
  const left = TOTAL - sum;
  const invalid = validateSeats(p, IDS);
  const setCell = (id: string, c: SeatCell) => {
    unit.setDraft({ ...p, seats: { ...p.seats, [id]: c } });
    setPreview(null);
  };
  const setV = (id: string, v: number) => setCell(id, { v: Math.max(0, Math.min(TOTAL, Math.round(v) || 0)), src: "manual", locked: true });
  const targets = blocs?.blocs.filter((b) => b.target !== null) ?? [];
  const runFill = () => setPreview(fillAll(IDS, p.seats, POLLS, blocs?.blocs ?? []));
  const apply = () => {
    if (preview?.ok) unit.setDraft({ ...p, seats: preview.seats, pollsAsOf: POLLS_AS_OF });
    setPreview(null);
  };
  const rows = IDS;

  return (
    <div>
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5 [&>*]:min-w-0 items-start">
        <div className="lg:sticky lg:top-4 space-y-3">
          <SeatBoard values={values} />
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={unit.status} />
            <span className="text-xs text-ink-soft">
              נקודת פתיחה: {START_OPTIONS.find((o) => o.id === p.start)?.title}
              {p.pollsAsOf ? ` · ממוצע הסקרים מ-${dateLong(p.pollsAsOf)}` : ""}
            </span>
          </div>
          {sum === TOTAL && <Share values={values} />}
        </div>

        <div>
          <p className="text-sm text-ink-soft mb-2">
            ערך שקבעתם ננעל מיד, ו"השלם הכול" לא נוגע בו. מנעול פתוח = "השלם הכול" רשאי לשנות.
            {targets.length > 0 && ` "השלם הכול" מתחשב גם ביעדי הגושים שלכם (${targets.map((b) => `${b.name}: ${b.target}`).join(", ")}).`}
          </p>
          <ul className="divide-y divide-paper-line border-y border-paper-line" aria-label="מנדטים לכל רשימה">
            {rows.map((id) => {
              const c = p.seats[id] ?? { v: 0, src: "manual", locked: false };
              const under = c.v > 0 && c.v < THRESHOLD_SEATS;
              const name = nameOf(id);
              return (
                <li key={id} className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold block truncate">{name}</span>
                      <span className="text-xs text-ink-soft">
                        {c.src === "filled" ? "הושלם" : c.locked ? "קבעתם" : "פתוח"}
                        {K25_MAP[id] && p.start === "k25" ? ` · 2022: ${k25Name(K25_MAP[id])}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      <button type="button" aria-label={`פחות ל${name}`} disabled={c.v <= 0} onClick={() => setV(id, c.v - 1)} className="w-11 h-11 rounded-full border-2 border-ink text-2xl font-bold leading-none disabled:opacity-30 active:bg-ink active:text-paper-card">
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={TOTAL}
                        aria-label={`מנדטים ל${name}`}
                        value={c.v}
                        onChange={(e) => setV(id, Number(e.target.value))}
                        className="w-14 h-11 text-center font-num tabular text-2xl bg-paper text-ink rounded-theme border border-paper-line [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        style={{ textAlign: "center" }}
                      />
                      <button type="button" aria-label={`עוד ל${name}`} disabled={left <= 0} onClick={() => setV(id, c.v + 1)} className="w-11 h-11 rounded-full border-2 border-ink bg-ink text-paper-card text-2xl font-bold leading-none disabled:opacity-30">
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-pressed={c.locked}
                      aria-label={c.locked ? `${name}: נעול. לחיצה פותחת לשינוי ב"השלם הכול"` : `${name}: פתוח. לחיצה נועלת`}
                      onClick={() => setCell(id, { ...c, locked: !c.locked, src: c.locked ? c.src : "manual" })}
                      className={`w-11 h-11 rounded-full grid place-items-center border ${c.locked ? "border-ink text-ink" : "border-paper-line text-ink-faint"}`}
                    >
                      <Lock on={c.locked} />
                    </button>
                  </div>
                  {under && (
                    <p className="text-xs text-warn mt-1">
                      {c.v} {c.v === 1 ? "מנדט" : "מנדטים"} זה פחות מאחוז החסימה (בערך {THRESHOLD_SEATS}). אפשר לשמור — רק שתדעו.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2 flex-wrap">
            {!resetAsk ? (
              <Btn onClick={() => setResetAsk(true)}>להתחיל מחדש</Btn>
            ) : (
              <>
                <span className="text-sm self-center">הטיוטה תימחק. בטוח?</span>
                <Btn kind="danger" onClick={() => (unit.setDraft(null), setResetAsk(false))}>
                  כן, מחדש
                </Btn>
                <Btn onClick={() => setResetAsk(false)}>לא</Btn>
              </>
            )}
          </div>
      {preview && (
        <div className="mt-4 border-2 border-ink rounded-theme p-4 bg-paper-card" role="region" aria-label="תצוגה מקדימה של השלם הכול">
          {preview.ok ? (
            <>
              <h3 className="font-display text-3xl leading-none mb-2">כך זה ייראה</h3>
              {preview.changed.length === 0 ? (
                <p className="text-sm">אין מה להשלים — הכול כבר קבוע.</p>
              ) : (
                <ul className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1 mb-3">
                  {preview.changed.map((id) => (
                    <li key={id} className="flex justify-between gap-2">
                      <span>{nameOf(id)}</span>
                      <bdi dir="ltr" className="tabular font-bold">
                        {p.seats[id]?.v ?? 0} → {preview.seats[id].v}
                      </bdi>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-soft mb-3">לפי חלק כל רשימה בממוצע הסקרים מ-{dateLong(POLLS_AS_OF)}; רשימה שבממוצע מתחת לסף מקבלת 0. נעולים לא זזו.</p>
              <div className="flex gap-2">
                <Btn kind="primary" onClick={apply}>
                  להחיל
                </Btn>
                <Btn onClick={() => setPreview(null)}>ביטול</Btn>
              </div>
            </>
          ) : (
            <>
              <p role="alert" className="text-sm text-warn font-bold mb-2">
                {fillErrorText(preview.error)}
              </p>
              <Btn onClick={() => setPreview(null)}>הבנתי</Btn>
            </>
          )}
        </div>
      )}

      {/* פס פעולה דביק באזור האגודל */}
      <div className="sticky z-20 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 mt-5">
        <div className="bg-paper-card border-2 border-ink rounded-theme shadow-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[7rem]" aria-live="polite">
            <span className="text-xs text-ink-soft block leading-none">{left >= 0 ? "נותרו לחלוקה" : "יותר מדי"}</span>
            <span className={`font-num tabular text-3xl leading-none ${left < 0 ? "text-warn" : ""}`}>{Math.abs(left)}</span>
          </div>
          <Btn onClick={runFill}>השלם הכול</Btn>
          <SaveButton unit={unit} session={session} invalid={invalid} compact />
        </div>
        {unit.error && (
          <p role="alert" className="text-sm text-warn bg-paper-card rounded-theme px-3 py-1 mt-1">
            {unit.error}
          </p>
        )}
        {!CROWD_URL && <p className="sr-only">השמירה עוד לא פעילה באתר.</p>}
      </div>

        </div>
      </div>

      {crowd && (
        <Fold title="שלי מול הגולשים מול הסקרים">
          <Explained
            kind="השערות גולשים, אינן סקר"
            source="ההשערות האחרונות של הגולשים באתר (חציון), וממוצע הסקרים של האתר"
            asOf={dateLong(POLLS_AS_OF)}
            assumption="הגולשים בחרו להשתתף בעצמם — זה לא מדגם מייצג."
            methodAnchor="crowd"
          >
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-ink-soft text-start">
                  <th className="text-start font-normal py-1">רשימה</th>
                  <th className="font-normal">שלי</th>
                  <th className="font-normal">הגולשים</th>
                  <th className="font-normal">הסקרים</th>
                </tr>
              </thead>
              <tbody>
                {IDS.map((id) => (
                  <tr key={id} className="border-t border-paper-line">
                    <td className="py-1">{nameOf(id)}</td>
                    <td className="text-center font-bold">{values[id]}</td>
                    <td className="text-center">{crowd[id] ?? "—"}</td>
                    <td className="text-center">{POLLS[id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Explained>
        </Fold>
      )}
    </div>
  );
}

function Lock({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {on ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
    </svg>
  );
}
