import { Link } from "react-router-dom";

/** כניסה לצ׳ט החכם מהבית: פותחת את השיחה עצמה באזור האישי, בסוג "שיפור או שאלה" (ועם מפתח מחובר — ישר לשיחה הפרטית) */
export default function HomeAssistant() {
  return <Link className="c-chart-link" to="/ai?ask">יש שאלה? שאלו את הצ׳ט החכם ←</Link>;
}
