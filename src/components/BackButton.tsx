import { useNavigate } from "react-router-dom";
import { isEmbed } from "../lib/embed";

/** כפתור "חזרה" בכל סקר וניחוש (הכרעת בעלים 03.11.2026): לדף הקודם, ואם נכנסו ישירות — לכל הסקרים והניחושים */
export default function BackButton() {
  const nav = useNavigate();
  const fallback = isEmbed() ? "/surveys?embed=1" : "/surveys";
  return <button type="button" className="f-btn !min-h-[36px]" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav(fallback))}>→ חזרה</button>;
}
