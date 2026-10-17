import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ChartHost = createContext<HTMLElement | null>(null);

/** אותו תרשים: במחשב לצד כל סביבת העריכה, בטלפון בתוך רצף הקריאה. */
export default function GuessWorkspace({ active, children }: { active: boolean; children: ReactNode }) {
  const [wide, setWide] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const desktop = active && wide;
  return <ChartHost.Provider value={desktop ? host : null}>
    <div className={desktop ? "c-guess-desktop" : undefined}>
      {desktop && <div ref={setHost} className="c-guess-chart-host" />}
      <div className={desktop ? "c-guess-edit-pane" : undefined}>{children}</div>
    </div>
  </ChartHost.Provider>;
}

export function GuessChart({ children }: { children: ReactNode }) {
  const host = useContext(ChartHost);
  return host ? createPortal(children, host) : <>{children}</>;
}
