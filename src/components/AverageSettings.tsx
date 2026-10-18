import { useState } from "react";
import { saveSourcePreference, useSourcePreference } from "../lib/sourcePreference";
import { DATA_PRODUCTS } from "../lib/dataCatalog";
import { PUBLIC_AVERAGES } from "../lib/modelVisibility";
import { Segmented } from "./Choice";

export default function AverageSettings() {
  const { preference } = useSourcePreference("home");
  const current = preference?.preferredAverage === "polls.mean" ? "polls.mean" : "polls.adjusted";
  const [status, setStatus] = useState("");
  return <div className="space-y-4">
    <section><h3 className="font-bold">ממוצע סקרים</h3><p>ממוצע המנדטים שפורסמו, ללא חלוקה מחדש. הוא יכול לכלול שברים, וסכומו אינו בהכרח 120. תרשים הכנסת הוא המחשה יחסית על גבי 120 סמלים, ולא חלוקה מחדש. סמל בשני חצאי צבע מסמן גבול שכולל שבר; הוא אינו אומר שהשבר הוא דווקא חצי מנדט. המספרים במרכז מציגים את הממוצעים עצמם.</p></section>
    <section><h3 className="font-bold">ממוצע מותאם</h3><p>חלוקה מחדש ל־120 מושבים לפי נתוני התמיכה והחוק. רשימות מתחת לאחוז החסימה מוצאות מחלוקת המושבים. כאשר התמיכה משוחזרת מסקר מנדטים, זו המרה משוערת — לא אחוזי הצבעה מלאים שפורסמו.</p></section>
    <Segmented label="ברירת מחדל קבועה לכל האתר" value={current} options={PUBLIC_AVERAGES.map(id => ({ id, label: DATA_PRODUCTS[id].name }))} onChange={id => {
      setStatus("שומר…");
      void saveSourcePreference({ product: id }).then(where => setStatus(where === "account" ? "ברירת המחדל נשמרה בחשבון" : where === "local" ? "ברירת המחדל נשמרה בדפדפן" : "הבחירה נשמרה לביקור הזה בלבד")).catch(() => setStatus("השמירה לחשבון לא הושלמה. נסו שוב."));
    }} />
    <p className="text-sm text-ink-soft">הבחירה חלה במסכים שתומכים בממוצע שבחרתם. גרפי מגמות הסקרים ממשיכים להציג את הסקרים עצמם.</p>
    <p role="status" className="text-sm">{status}</p>
  </div>;
}
