import PersonalBlocs from "../../components/PersonalBlocs";
import { useMemo } from "react";
import type { SharedGuess as G } from "../../lib/shareGuess";
import { IDS, nameOf } from "./model";
import SeatBoard from "./SeatBoard";

/**
 * "ההשערה ששיתפו איתכם" — מי שהגיע מקישור שיתוף (?g=) רואה את הכנסת ששותפה, ואז מוזמן לבנות את שלו.
 * ההשערה של גולש — לא סקר ולא תחזית; בלי המלצה.
 */
export default function SharedGuess({ g, hasDraft, onStart, onClose }: { g: G; hasDraft: boolean; onStart: (fromThis: boolean) => void; onClose: () => void }) {
  const order = useMemo(() => IDS.filter((id) => g.seats[id] > 0).sort((a, b) => g.seats[b] - g.seats[a]), [g]);
  return (
    <section className="mb-6 border-2 border-ink rounded-theme bg-paper-card p-4 md:p-5" aria-labelledby="shared-title">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">ההשערה ששיתפו איתכם</p>
          <h2 id="shared-title" className="font-display text-4xl md:text-5xl leading-none">
            {g.username ? (
              <>
                הכנסת של <bdi>{g.username}</bdi>
              </>
            ) : (
              "כך ניחשו את הכנסת ה-26"
            )}
          </h2>
          <p className="text-sm text-ink-soft mt-1">השערה של גולש{g.pct ? ", לפי אחוזי הצבעה ומחושבת לפי החוק" : ""} — לא סקר ולא תחזית.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="סגירת ההשערה ששותפה" className="w-11 h-11 shrink-0 rounded-full text-2xl leading-none text-ink-soft hover:text-ink">
          ×
        </button>
      </div>
      <PersonalBlocs title="הגושים שלי לפי ההשערה ששותפה איתי" values={g.seats} source="השערת המשתתף ששיתף את הקישור, לפי הגושים שלכם" asOf="תוכן הקישור" />
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-4 [&>*]:min-w-0 items-start">
        <SeatBoard values={g.seats} />
        <div>
          <table className="w-full text-sm tabular">
            <caption className="sr-only">המנדטים לכל רשימה בהשערה ששותפה</caption>
            <thead>
              <tr className="text-ink-soft">
                <th className="text-start font-normal py-1">רשימה</th>
                <th className="font-normal">מנדטים</th>
                {g.pct && <th className="font-normal">אחוזים</th>}
              </tr>
            </thead>
            <tbody>
              {order.map((id) => (
                <tr key={id} className="border-t border-paper-line">
                  <td className="py-1">{nameOf(id)}</td>
                  <td className="text-center font-bold">{g.seats[id]}</td>
                  {g.pct && <td className="text-center"><bdi dir="ltr">{g.pct[id] ?? 0}%</bdi></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 bg-ink text-paper-card rounded-theme p-4 space-y-3">
        <p className="font-display text-3xl md:text-4xl leading-none">עכשיו תורכם — בנו את הכנסת שלכם</p>
        <p className="text-sm opacity-90">120 מושבים, בדרך שלכם. אחר כך משווים לממוצע הגולשים ולסקרים.</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => onStart(false)} className="min-h-[44px] px-5 rounded-full border-2 border-paper-card bg-paper-card text-ink text-sm font-bold">
            בנו את הכנסת שלכם
          </button>
          <button type="button" onClick={() => onStart(true)} className="min-h-[44px] px-5 rounded-full border-2 border-paper-card text-paper-card text-sm font-bold">
            התחילו מההשערה הזו
          </button>
        </div>
        {hasDraft && <p className="text-xs opacity-90">"התחילו מההשערה הזו" מחליף את הטיוטה שלכם כאן (גרסה שנשמרה נשארת בהיסטוריה).</p>}
      </div>
    </section>
  );
}
