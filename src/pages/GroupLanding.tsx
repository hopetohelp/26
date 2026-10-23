import { Suspense, lazy, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageTitle } from "../components/ui";
import { call, CrowdError, type GroupPublic } from "../lib/crowdApi";
import { rememberLinkJoin } from "../lib/linkJoin";

const Guess = lazy(() => import("./Guess"));

/** כניסה אחת לכל ביקור בלשונית, וכניסה "ראשונה" לדפדפן שעוד לא ביקר בקישור הזה. נכשל בשקט — הספירה אינה חוסמת את הדף */
function recordVisit(slug: string) {
  rememberLinkJoin(slug);
  let fresh = true;
  try {
    if (sessionStorage.getItem(`g-open:${slug}`)) return;
    sessionStorage.setItem(`g-open:${slug}`, "1");
    fresh = !localStorage.getItem(`g-seen:${slug}`);
    localStorage.setItem(`g-seen:${slug}`, "1");
  } catch { /* בלי אחסון — נספרת כל כניסה כראשונה */ }
  void call("/group/visit", { body: { slug, fresh } }).catch(() => {});
}

/**
 * קישור הקבוצה (#/g/<שם באנגלית>): פותח את סקר האתר כשבראשו תמונת הקבוצה. הנתונים של הקבוצה נשארים לחבריה בלבד —
 * מי שאינו חבר רואה את כלל המשתתפים. קישור שאינו קיים ⇐ הודעה; שרת שאינו זמין ⇐ סקר האתר הרגיל.
 */
export default function GroupLanding() {
  const { slug = "" } = useParams();
  const [info, setInfo] = useState<GroupPublic | null | "missing" | "offline">(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    call<GroupPublic>(`/group/public?slug=${encodeURIComponent(slug)}`).then(
      (i) => { if (live) { setInfo(i); recordVisit(slug); } },
      (e) => { if (live) setInfo(e instanceof CrowdError && e.status === 404 ? "missing" : "offline"); },
    );
    return () => { live = false; };
  }, [slug]);
  if (info === null) return <p className="text-ink-soft">טוען…</p>;
  if (info === "missing") return <PageTitle lead="בדקו שהקישור הועתק במלואו, או בקשו ממנהל הקבוצה קישור חדש.">קישור הקבוצה אינו קיים</PageTitle>;
  return <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><Guess landing={info === "offline" ? null : info} /></Suspense>;
}
