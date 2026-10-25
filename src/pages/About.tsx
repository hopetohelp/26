import { Card, PageTitle } from "../components/ui";
import { meta } from "../lib/data";
import { date } from "../lib/format";
import { PARTY_IMAGES } from "../lib/partyImages";
import { POLLSTER_LOGOS } from "../lib/pollsterLogos";
import { PartyAvatar } from "../components/PartyAvatar";

export default function About() {
  return (
    <>
      <PageTitle>אודות</PageTitle>
      <Card>
        <div className="text-sm space-y-3">
          <p>
            האתר מנתח את הבחירות לכנסת ה-26 על בסיס נתונים פומביים: התוצאות הרשמיות של ועדת הבחירות המרכזית, והסקרים שפורסמו בכלי התקשורת. הוא
            אינו קשור לאף מפלגה, אינו עורך סקרים ואינו ממליץ על אף רשימה.
          </p>
          {/* לשעבר בסרגל התחתון של כל עמוד (אוחד לכאן בהכרעת בעלים 8.10.2026) */}
          <p>
            <strong>האתר אינו עורך סקרים.</strong> הממוצעים והטווחים מחושבים מסקרים שכבר פורסמו, עם פרטי כל סקר ומקורו.
            תוצאות האמת — מקובצי ועדת הבחירות המרכזית. הנתונים נכונים ל-{date(meta.dataAsOf)}.
          </p>
          <p>
            הצבעים באתר ניטרליים במכוון ואינם צבעי המפלגות. ליד שם כל רשימה מוצגת תמונת ראש הרשימה, או סמל הרשימה כשאין לה ראש אחד; הקרדיט המלא בכרטיס "תמונות" שמתחת. "מפלגות הממשלה היוצאת" היא הגדרה עובדתית לפי הרכב הממשלה
            ה-37, לא הערכה לגבי הקואליציה הבאה.
          </p>
          <p>
            כל הקוד והנתונים פתוחים לעיון ב-
            <a href="https://github.com/hopetohelp/26">github.com/hopetohelp/26</a>. מצאתם טעות? אפשר לדווח{" "}
            <a href="https://github.com/hopetohelp/26/issues">כאן</a>, וכל תיקון נרשם בהיסטוריה של הריפו.
          </p>
          <p>
            אפשר לעבור בין מצב יום ללילה (או לפי המכשיר) בכפתור בראש העמוד. הבחירה נשמרת בדפדפן שלכם בלבד.
          </p>
          {import.meta.env.VITE_FEEDBACK_URL && (
            <p>
              כפתור "הערה?" שולח הערה בלי מייל ובלי הרשמה. נשמרים רק הנושא, הטקסט, העמוד והעיצוב שממנו נשלחה. כתובת ה-IP אינה נשמרת: ממנה נגזר
              מפתח יומי חד-כיווני, חתום בסוד של השרת ונמחק אחרי יומיים, שנועד רק להגביל הצפה. אחרי השליחה מתקבל קישור אישי, ושם מופיעה התשובה ואפשר להמשיך לכתוב. הקישור עצמו
              אינו נשמר אצלנו — רק גיבוב שלו.
            </p>
          )}
          <p>
            <strong>חשבון באתר:</strong> נכנסים עם Google או נרשמים במייל, וחשבון אחד לכל מייל. המייל והשם נשמרים אצלנו מוצפנים ומוצגים רק לבעל
            החשבון. הניחושים נכנסים לסטטיסטיקות בלי שום פרט מזהה, וגם צוות האתר רואה אותן בלי שם ובלי מייל. בלי חשבון — הכול נשמר רק בדפדפן שלכם.
          </p>
          <p>
            <strong>מי בנה את האתר:</strong> קלוד קוד, עם ייעוץ וביקורת של קודקס, ובהכוונה כללית של הבעלים. כל הערה שנכתבת באתר נקראת על ידי
            קלוד קוד ועל ידי הבעלים.
          </p>
          <p>מקורות הנתונים ושיטת החישוב — בעמוד "שיטה ומקורות". שימוש חוזר בנתונים — עם ציון המקור.</p>
        </div>
      </Card>
      <Card title="תמונות" id="images" tab="about" className="max-w-3xl">
        <p className="text-sm mb-3">
          התמונות נועדו לזיהוי הרשימה בלבד, ואינן מעידות על הסכמת מי שמופיע בהן. תמונות האנשים מוויקימדיה קומונס ברישיונות חופשיים, וכאן היוצר והרישיון של כל אחת.
        </p>
        <ul className="text-sm divide-y divide-paper-line border-y border-paper-line">
          {Object.entries(PARTY_IMAGES).map(([id, img]) => (
            <li key={id} className="flex items-center gap-3 py-2">
              <PartyAvatar id={id} size={36} />
              <span className="min-w-0">
                <span className="font-semibold">{img.subject}</span>
                {" · "}
                <a href={img.source}>מקור</a>
                <span className="block text-ink-soft">{img.author} · {img.license}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm mt-3 text-ink-soft">לרשימות הציבור החרדי וצבע שחור לא נמצאה תמונה חופשית או סמל רשמי להורדה, ולכן אין להן תמונה.</p>
        <p className="text-sm mt-4 mb-2">סמלי מכוני הסקרים והערוצים בבורר המקור הם סמלי האתרים הרשמיים שלהם, וסימנים מסחריים של בעליהם:</p>
        <ul className="text-sm flex flex-wrap gap-x-4 gap-y-1">
          {Object.values(POLLSTER_LOGOS).map((l) => <li key={l.file}><a href={l.source}>{l.owner}</a></li>)}
        </ul>
      </Card>
    </>
  );
}
