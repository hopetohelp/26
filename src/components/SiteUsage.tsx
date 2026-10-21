import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dateTime, num } from "../lib/format";
import Explained from "./Explained";
import { DICTIONARY_DEFINITIONS } from "../lib/dictionaryDefinitions";
import { loadSiteUsage, type SiteUsage as Usage } from "../lib/siteUsage";

const definition = DICTIONARY_DEFINITIONS.find(d => d.id === "usage")!;

export default function SiteUsage() {
  const [data, setData] = useState<Usage | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const next = await loadSiteUsage(controller.signal);
        if (!disposed) {
          setData(old => !old || Date.parse(next.data.publishedAt) >= Date.parse(old.publishedAt) ? next.data : old);
          setLive(next.live);
        }
      } catch { if (!disposed) setLive(false); }
      finally { clearTimeout(timeout); pending = false; }
    };
    void refresh();
    const interval = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return <section aria-label="השימוש באתר" className="mt-4 border-t border-paper-line pt-3 text-sm text-ink-soft">
    <Explained bare kind="נתוני שימוש באתר" source={definition.source} assumption={definition.assumption} asOf={data?.publishedAt ?? "טרם התקבל נתון"} methodAnchor="usage">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p><strong className="font-num text-ink">{data ? num(data.totalVisitors) : "—"}</strong> משתמשים</p>
        <p><strong className="font-num text-ink">{data ? num(data.totalVisits) : "—"}</strong> כניסות</p>
        <p className="text-xs">{data ? `${live ? "מתעדכן אוטומטית" : "הנתון האחרון שהתקבל"} · ${dateTime(data.publishedAt)}` : "נתוני השימוש טרם זמינים"}</p>
      </div>
      <p className="mt-1 text-xs">ספירה מצטברת לפי דפדפנים; כניסות כוללות מעבר בין עמודים. <Link to="/method#usage" className="text-accent underline">איך נספר?</Link></p>
    </Explained>
  </section>;
}
