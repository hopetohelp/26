import { Card, PageTitle } from "../components/ui";
import { meta } from "../lib/data";
import { date } from "../lib/format";
import { PARTY_IMAGES } from "../lib/partyImages";
import { POLLSTER_LOGOS } from "../lib/pollsterLogos";
import { Link } from "react-router-dom";
import { PartyAvatar } from "../components/PartyAvatar";

export const SITE_EMAIL = "hopetohelp.il@gmail.com";

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
          <p>מקורות הנתונים ושיטת החישוב — בעמוד "שיטה ומקורות". שימוש חוזר בנתונים — עם ציון המקור.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>נבנה על ידי <a href={`mailto:${SITE_EMAIL}`} dir="ltr">{SITE_EMAIL}</a></span>
            <Link to="/ai" className="inline-flex items-center min-h-[44px] px-4 rounded-theme bg-ink text-paper-card font-bold no-underline">כנס לתמיכה</Link>
          </p>
        </div>
      </Card>
      <PrivacyPolicy />
      <AccessibilityStatement />
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

/** מדיניות פרטיות מלאה — חובת יידוע לפי חוק הגנת הפרטיות (תיקון 13). עדכון מהותי ⇐ גם PRIVACY_POINTS ו-PRIVACY_VERSION ב-src/lib/privacy.ts */
function PrivacyPolicy() {
  return (
    <Card title="מדיניות פרטיות" id="privacy-policy" tab="about" className="max-w-3xl">
      <div className="text-sm space-y-3">
        <p>עודכן ב-26/10. מסירת המידע אינה חובה לפי חוק: אפשר להשתמש בכל האתר בלי חשבון, ואז הכול נשמר רק בדפדפן שלכם.</p>
        <p><strong>מה נאסף ולמה:</strong></p>
        <ul className="list-disc ps-5 space-y-1">
          <li><strong>חשבון</strong> (אם נרשמתם): מייל ושם, שמורים מוצפנים — לכניסה לחשבון, לשחזור סיסמה ולשיוך לקבוצה.</li>
          <li><strong>ניחושים והעדפות</strong>: נשמרים בחשבון כדי שתוכלו לחזור אליהם, ונכנסים לסטטיסטיקות בלי שום פרט מזהה. מנהלי קבוצות רואים רק סיכומים, ורק מ-50 משתתפים.</li>
          <li><strong>הערות ופניות לתמיכה</strong>: הטקסט, העמוד שממנו נשלחו ותשובת הצוות — כדי לענות ולתקן.</li>
          <li><strong>מונה כניסות</strong>: מזהה אקראי בדפדפן, ובשרת רק גיבוב שלו — בלי כתובת IP, שם או מיקום.</li>
          <li><strong>בדפדפן בלבד</strong>: מצב יום/לילה והגדרות תצוגה.</li>
        </ul>
        <p><strong>גורמים חיצוניים שמעבדים מידע עבור האתר:</strong> Cloudflare (אחסון האתר והנתונים), Google (כניסה עם חשבון Google, אם בחרתם בה), וספק בינה מלאכותית (Google Gemini או Anthropic) שמקבל את השאלות שנכתבות לעוזר החכם ולתמיכה, בלי מייל ובלי שם. אל תכתבו לעוזר פרטים אישיים. המידע אינו נמכר ואינו משמש לפרסום.</p>
        <p><strong>הזכויות שלכם:</strong> לעיין במידע, לתקן אותו או למחוק את החשבון וכל המידע — באזור האישי, בכל רגע. לכל בקשה אחרת בנושא פרטיות: <a href={`mailto:${SITE_EMAIL}`} dir="ltr">{SITE_EMAIL}</a>.</p>
        <p><strong>אבטחה:</strong> החיבור מוצפן, המייל והשם שמורים מוצפנים, וסיסמאות נשמרות רק כגיבוב.</p>
      </div>
    </Card>
  );
}

/** הצהרת נגישות — תקנה 35 לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), ת"י 5568 */
function AccessibilityStatement() {
  return (
    <Card title="הצהרת נגישות" id="accessibility" tab="about" className="max-w-3xl">
      <div className="text-sm space-y-3">
        <p>האתר נבנה כך שיתאים לתקן הישראלי 5568 ברמה AA (המבוסס על הנחיות WCAG 2.1). עודכן ב-26/10.</p>
        <p><strong>מה הונגש:</strong></p>
        <ul className="list-disc ps-5 space-y-1">
          <li>ניווט מלא במקלדת, עם קישור "דלג לתוכן" בראש כל עמוד וסימון ברור של המיקום.</li>
          <li>מבנה כותרות וסימון שפה וכיוון (עברית, מימין לשמאל) לקוראי מסך.</li>
          <li>ניגודיות צבעים לפי התקן, במצב יום ובמצב לילה; המידע אינו מועבר בצבע בלבד.</li>
          <li>הגדלת טקסט עד 200% והתאמה לטלפון, לטאבלט ולמחשב, בלי גלילה לרוחב.</li>
          <li>כיבוי אנימציות למי שהגדיר "הפחתת תנועה" במכשיר.</li>
          <li>כל הנתונים שבגרפים מופיעים גם בטבלאות ובמספרים כתובים.</li>
        </ul>
        <p><strong>מגבלות ידועות:</strong> חלק מהגרפים האינטראקטיביים מורכבים לקריאה בקורא מסך; הנתונים שלהם זמינים בטבלאות שלידם. תמונות ראשי הרשימות מתוארות בשם הרשימה.</p>
        <p><strong>נתקלתם בבעיית נגישות?</strong> כתבו לנו ל-<a href={`mailto:${SITE_EMAIL}`} dir="ltr">{SITE_EMAIL}</a> או דרך <Link to="/ai">התמיכה</Link>, ונטפל בהקדם.</p>
      </div>
    </Card>
  );
}
