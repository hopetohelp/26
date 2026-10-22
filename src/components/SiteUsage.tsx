import { useEffect, useState } from "react";
import { num } from "../lib/format";
import Explained from "./Explained";
import { DICTIONARY_DEFINITIONS } from "../lib/dictionaryDefinitions";
import { loadSiteUsage, type SiteUsage as Usage } from "../lib/siteUsage";

const definition = DICTIONARY_DEFINITIONS.find(d => d.id === "usage")!;

export default function SiteUsage() {
  const [data, setData] = useState<Usage | null>(null);
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
        }
      } catch { /* שומרים את הנתון האחרון בלי לאפס את המונים. */ }
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
  return <section aria-label="השימוש באתר" className="mt-4 border-t border-paper-line pt-4">
    <Explained bare kind="נתוני שימוש באתר" source={definition.source} assumption={definition.assumption} asOf={data?.publishedAt ?? "טרם התקבל נתון"} methodAnchor="usage">
      <div className="flex justify-center gap-3">
        <div className="flex min-w-0 w-44 flex-col items-center rounded-2xl border border-accent/15 bg-accent/5 px-3 py-4 text-center">
          <strong className="font-num text-2xl text-ink">{data ? num(data.totalUsers) : "—"}</strong>
          <span className="mt-1 text-sm text-ink-soft">משתמשים שהתחברו</span>
        </div>
        <div className="flex min-w-0 w-44 flex-col items-center rounded-2xl border border-accent/15 bg-accent/5 px-3 py-4 text-center">
          <strong className="font-num text-2xl text-ink">{data ? num(data.totalVisitors) : "—"}</strong>
          <span className="mt-1 text-sm text-ink-soft">כניסות</span>
        </div>
      </div>
    </Explained>
  </section>;
}
