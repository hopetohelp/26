import { useState } from "react";
import Explained from "../components/Explained";
import { Badge, Card, ChartWithTable, Note, PageTitle, Columns } from "../components/ui";
import { registry, results } from "../lib/data";
import { num, pct } from "../lib/format";

export default function Voters() {
  const [turnout, setTurnout] = useState(70);
  const [wastedPct, setWastedPct] = useState(5);
  const series = registry.series;
  const k26 = registry.k26;
  const last = series[series.length - 1];
  const growth = ((k26.eligible - last.eligible) / last.eligible) * 100;
  const valid = k26.eligible * (turnout / 100) * (1 - 0.006);
  const threshold = valid * 0.0325;
  const perSeat = (valid * (1 - wastedPct / 100)) / 120;
  const maxE = Math.max(k26.eligible, ...series.map((s) => s.eligible));

  return (
    <>
      
      <Columns>
      <PageTitle inColumns lead="כמה בעלי זכות בחירה היו בכל מערכת, כמה הצביעו, וכמה קולות עלה לעבור את אחוז החסימה — ומה זה אומר על 2026.">
        מצביעים — אז והיום
      </PageTitle>

      <Card title="בעלי זכות בחירה ושיעור ההצבעה">
        <Explained
          kind="נתון רשמי"
          source="ועדת הבחירות המרכזית — עמודי התוצאות הארציות של כל מערכת"
          asOf="התוצאות הסופיות של כל מערכת; 2026 — מספר מדווח"
          assumption="שיעור ההצבעה = הצביעו ÷ בעלי זכות בחירה בפנקס (כולל ישראלים שגרים בחו״ל)."
          methodAnchor="voters"
        >
          <ChartWithTable
            summary={`מ-${num(series[0].eligible)} בעלי זכות ב-2019 ל-${num(last.eligible)} ב-2022, וכ-${num(k26.eligible)} ב-2026 (מדווח).`}
            chart={
              <ul className="space-y-2" aria-hidden="true">
                {[...series.map((s) => ({ label: s.label, e: s.eligible, v: s.voted, est: false })), { label: "2026 (מדווח)", e: k26.eligible, v: 0, est: true }].map((s) => (
                  <li key={s.label} className="grid grid-cols-[7rem_1fr_6rem] items-center gap-2 text-sm">
                    <span>{s.label}</span>
                    <span className="relative h-6 bg-paper rounded">
                      <span className={`absolute inset-y-0 right-0 rounded ${s.est ? "bg-accent/30 border border-dashed border-accent" : "bg-accent/40"}`} style={{ width: `${(s.e / maxE) * 100}%` }} />
                      {s.v > 0 && <span className="absolute inset-y-0 right-0 rounded bg-accent" style={{ width: `${(s.v / maxE) * 100}%` }} />}
                    </span>
                    <span className="tabular-nums">{s.v > 0 ? pct((s.v / s.e) * 100) : "—"}</span>
                  </li>
                ))}
              </ul>
            }
            table={
              <table className="w-full text-sm">
                <caption className="sr-only">בעלי זכות בחירה, מצביעים ואחוז החסימה בכל מערכת</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1">מערכת</th>
                    <th scope="col">בעלי זכות</th>
                    <th scope="col">הצביעו</th>
                    <th scope="col">שיעור הצבעה</th>
                    <th scope="col">כשרים</th>
                    <th scope="col">אחוז החסימה בקולות</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.id} className="border-b border-paper-line/60">
                      <th scope="row" className="text-right py-1 font-medium">{s.label}</th>
                      <td className="tabular-nums">{num(s.eligible)}</td>
                      <td className="tabular-nums">{num(s.voted)}</td>
                      <td className="tabular-nums">{pct((s.voted / s.eligible) * 100)}</td>
                      <td className="tabular-nums">{num(s.valid)}</td>
                      <td className="tabular-nums">{num(s.valid * 0.0325)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Explained>
        <Note>
          2026: <Badge tone="warn">טרם אומת</Badge> דווח "כ-{num(k26.eligible)}" — גידול של כ-{growth.toFixed(1)}% מאז 2022. יעודכן לפי פרסום רשמי של ועדת הבחירות.
        </Note>
      </Card>

      <Card title="2026: כמה קולות יידרשו?">
        <div className="grid sm:grid-cols-2 gap-4 mb-3">
          <label className="text-sm">
            שיעור הצבעה: <strong>{turnout}%</strong>
            <input type="range" min={60} max={80} step={0.5} value={turnout} onChange={(e) => setTurnout(Number(e.target.value))} className="w-full" />
          </label>
          <label className="text-sm">
            קולות לרשימות שלא יעברו: <strong>{wastedPct}%</strong>
            <input type="range" min={0} max={12} step={0.5} value={wastedPct} onChange={(e) => setWastedPct(Number(e.target.value))} className="w-full" />
          </label>
        </div>
        <Explained
          kind="תרחיש"
          source="מספר בעלי הזכות המדווח × שיעור ההצבעה שבחרתם; פסולים 0.6%"
          asOf="תרחיש — לא תחזית"
          assumption="המספרים תלויים בשני ההנחות שבחרתם. בשנים 2019–2022 השיעור נע בין 67.4% ל-71.5%, והקולות שלא עברו בין 0.8% ל-8.8%."
          methodAnchor="voters"
        >
          <dl className="grid sm:grid-cols-3 gap-3">
            <div className="bg-paper rounded p-3"><dt className="text-sm text-ink-soft">קולות כשרים</dt><dd className="text-2xl font-bold tabular-nums">{num(valid)}</dd></div>
            <div className="bg-paper rounded p-3"><dt className="text-sm text-ink-soft">אחוז החסימה בקולות</dt><dd className="text-2xl font-bold tabular-nums">{num(threshold)}</dd><dd className="text-xs text-ink-soft">ב-2022: {num(results[results.length - 1].valid * 0.0325)}</dd></div>
            <div className="bg-paper rounded p-3"><dt className="text-sm text-ink-soft">קולות למנדט (ממוצע)</dt><dd className="text-2xl font-bold tabular-nums">{num(perSeat)}</dd><dd className="text-xs text-ink-soft">ב-2022: 36,228</dd></div>
          </dl>
        </Explained>
      </Card>

      <Card title="למה שיעור ההצבעה הרשמי נמוך מהאמיתי">
        <p className="text-sm">
          פנקס הבוחרים כולל את כל האזרחים מגיל 18 — גם מי שגר בחו"ל ואינו יכול להצביע (אין בישראל הצבעה מחו"ל, למעט שליחים). לכן שיעור
          ההצבעה בקרב מי שגר בארץ גבוה מהשיעור הרשמי. אין מדידה רשמית אחת למספר הישראלים בחו"ל, ולכן האתר אינו מציג "שיעור אמיתי" כמספר
          אחד.
        </p>
      </Card>
      </Columns>
    </>
  );
}
