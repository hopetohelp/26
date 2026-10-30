import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { coverage, flow } from "../lib/voterFlow";

const TITLE = "מאיפה יודעים את הנתונים, ולמה הם יותר מדויקים?";
const millions = (v: number) => (v / 1e6).toFixed(1);

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-bold mt-6 mb-2">{title}</h3>
      <ul className="list-disc ps-5 grid gap-1.5 leading-relaxed">{children}</ul>
    </section>
  );
}

/** חלון הסבר מעל כל המסך, נפתח מראש "מה השתנה" (הכרעת בעלים 30.10.2026: מקיף, מתומצת, שורות קצרות ומונחים פשוטים) */
export default function FlowExplain() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; opener.current?.focus(); };
  }, [open]);
  const counted = flow.valid2026 * coverage().total / 100;
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)}
        className="w-full text-start rounded-theme border border-paper-line bg-paper-card px-4 py-3 min-h-[48px] font-bold flex items-center justify-between gap-3 hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <span>{TITLE}</span><span aria-hidden="true" className="text-ink-soft">←</span>
      </button>
      {open && createPortal(
        <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="flow-explain-title"
          className="fixed inset-0 z-[70] bg-paper text-ink overflow-y-auto outline-none"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="sticky top-0 bg-paper border-b border-paper-line">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
              <h2 id="flow-explain-title" className="text-xl font-display leading-tight">{TITLE}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה"
                className="shrink-0 w-11 h-11 rounded-full border border-paper-line text-xl leading-none hover:bg-accent-soft">✕</button>
            </div>
          </div>
          <div className="max-w-2xl mx-auto px-4 pb-10 text-base">
            <Part title="הבעיה">
              <li>ההצבעה סודית.</li>
              <li>אף אחד לא יודע למי הצביע כל אדם.</li>
              <li>אבל ידוע כמה קולות קיבלה כל רשימה בכל קלפי.</li>
              <li>ועדת הבחירות מפרסמת את זה. יש לנו את 2022 ואת 2026.</li>
            </Part>
            <Part title="הרעיון">
              <li>משווים את אותה קלפי בשתי הבחירות.</li>
              <li>אותו מקום. אותם שכנים.</li>
              <li>דוגמה: רשימה א ירדה ב-50 קולות. רשימה ב עלתה ב-50.</li>
              <li>כנראה חלק מהקולות עברו מ-א ל-ב.</li>
            </Part>
            <Part title="שני שלבים: קודם רחב, אחר כך מדויק">
              <li><b>1. תמונה רחבה — כדי לזהות את המגמה.</b></li>
              <li>קלפי אחת לא מוכיחה כלום. אולי זה מקרה.</li>
              <li>אלפי קלפיות יחד מראות לאן הקולות זזים.</li>
              <li>למשל: "מצביעי רשימה א עוברים בעיקר ל-ב".</li>
              <li><b>2. קלפי בודדת — כדי לדעת כמה בדיוק.</b></li>
              <li>את המגמה מחילים על כל קלפי לחוד.</li>
              <li>כך מקבלים את מספר הקולות שעברו בכל מקום.</li>
              <li>ומחברים הכול לסכום הארצי.</li>
            </Part>
            <Part title="המדרגות: מהמדויק אל הרחב">
              <li>מתחילים מהקטן והמדויק. רק מה שלא הסתדר עולה מדרגה.</li>
              <li><b>תת קלפי</b> — אותו מספר קלפי, באותו מקום, וכמעט אותו מספר בוחרים. הכי מדויק.</li>
              <li><b>מתחם</b> — כל הקלפיות באותו בית ספר, יחד. כי הוועדה מעבירה בוחרים בין קלפיות באותו מתחם.</li>
              <li><b>עיר</b> — כל היישוב יחד.</li>
              <li><b>ועדה אזורית</b> — כמה יישובים קטנים יחד.</li>
              <li><b>ארצי</b> — מה שנשאר.</li>
              <li>כך כל הקולות בפנים: {millions(counted)} מיליון.</li>
            </Part>
            <Part title="הטבלה: מהרחב אל המדויק">
              <li>קודם מחשבים טבלה לכל הארץ.</li>
              <li>אחר כך לכל ועדה אזורית. ואז לכל עיר.</li>
              <li>עיר גדולה — לפי הקלפיות שלה.</li>
              <li>יישוב קטן — קרוב לטבלה של האזור.</li>
              <li>כי בכל מקום אנשים עוברים אחרת.</li>
            </Part>
            <Part title="למה זה מדויק יותר">
              <li><b>כל הקולות בפנים.</b> בחישובים אחרים — לפעמים פחות מחצי.</li>
              <li><b>גם מי שלא הצביע נספר.</b> מי שנשאר בבית לא נחשב בטעות כמי שעבר רשימה.</li>
              <li><b>בודקים שזו באמת אותה קלפי.</b> לא רק אותו מספר.</li>
              <li><b>כל אזור לפי עצמו.</b> לא טבלה אחת לכל הארץ.</li>
              <li><b>שום קול לא הולך לאיבוד.</b> הסכומים שווים בדיוק לתוצאות הרשמיות.</li>
            </Part>
            <Part title="איך בודקים שזה באמת מדויק?">
              <li>מסתירים 1 מכל 5 קלפיות.</li>
              <li>מחשבים את הטבלה בלעדיהן.</li>
              <li>ואז מנחשים מה יצא בהן — ומשווים לתוצאה האמיתית.</li>
              <li><b>אצלנו: 8.8% מהקולות שובצו לא נכון.</b></li>
              <li>בטבלה אחת לכל הארץ, בלי "לא הצביעו": 10.8%.</li>
              <li>נבדק 5 פעמים, על כ-320 אלף קולות בכל פעם. אותה תוצאה בכל פעם.</li>
            </Part>
            <Part title="מה חשוב לזכור">
              <li>זה לא סקר. זו הערכה.</li>
              <li>מעבר קטן, של כמה אחוזים, יכול להיות טעות.</li>
              <li>קשה להפריד בין שתי רשימות שחזקות באותם מקומות.</li>
            </Part>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
