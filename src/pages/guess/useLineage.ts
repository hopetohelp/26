/**
 * השיוך האישי (רשימות היום ⇐ רשימות 2022) — טיוטה בדפדפן, שמירה בחשבון (POST /prefs, טבלת lineage_prefs).
 * מקור אחד ל"מה השתנה – מפלגות", לטור "בחירות 22" ולהתחלה "מבחירות 22" (docs/מנדטים-אחוזים-ומה-השתנה-תוכנית.md).
 * בלי חשבון — הטיוטה נשארת בדפדפן ועולה לחשבון בהרשמה (syncLocal).
 */
import { useCallback, useEffect, useState } from "react";
import modelFile from "../../data/model.json";
import { call } from "../../lib/crowdApi";
import { useCrowdAverage } from "../../lib/sources";
import { cleanLineage, DEFAULT_LINEAGE, K25_LISTS, sameLineage, type Lineage } from "../../lib/lineage";
import type { SaveUnit } from "./SaveButton";
import { errorText, type useSession, type SaveState } from "./useCrowd";

export const LINEAGE_KEY = "elections26.lineage";
const CAMPS_KEY = "elections26.camps";

interface Family { id: string; k25: string[]; k26: string[] }
const camp = (modelFile as unknown as { changes: { alternatives: { id: string; families: Family[] }[] } }).changes.alternatives.find((a) => a.id === "camp")!;
const letters = (names: string[]) => names.map((n) => K25_LISTS.find((l) => l.name === n)?.id).filter((x): x is string => !!x);

/** המחנות של הגרסה הקודמת (רשימה ⇐ מזהה מחנה) ⇐ שיוך. רק רשימות ששונו מברירת המחדל. */
export function lineageFromCamps(camps: unknown): Lineage | null {
  if (!camps || typeof camps !== "object") return null;
  const map = { ...DEFAULT_LINEAGE.map };
  let changed = false;
  for (const [id, fam] of Object.entries(camps as Record<string, string>)) {
    if (!(id in map) || typeof fam !== "string") continue;
    const def = camp.families.find((f) => f.k26.includes(id))?.id ?? "";
    if (fam === def) continue;
    const f = camp.families.find((x) => x.id === fam);
    map[id] = f ? letters(f.k25) : [];
    changed = true;
  }
  return changed ? { ...DEFAULT_LINEAGE, map } : null;
}

const read = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const write = (l: Lineage | null) => { try { if (l) localStorage.setItem(LINEAGE_KEY, JSON.stringify(l)); else localStorage.removeItem(LINEAGE_KEY); } catch { /* דפדפן בלי אחסון */ } };

export function useLineage(session: ReturnType<typeof useSession>) {
  const account = session.me?.prefs;
  const savedFromAccount = cleanLineage(account?.lineage) ?? lineageFromCamps(account?.camps) ?? null;
  const [draft, setDraftState] = useState<Lineage>(() => cleanLineage(read(LINEAGE_KEY)) ?? lineageFromCamps(read(CAMPS_KEY)) ?? DEFAULT_LINEAGE);
  const [saved, setSaved] = useState<Lineage>(DEFAULT_LINEAGE);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // מה שבחשבון: נקודת ההשוואה ל"נשמר", ומחליף את הדפדפן אם אין בו שינוי שלא נשמר
  const accountKey = JSON.stringify(savedFromAccount);
  useEffect(() => {
    if (!session.me) return;
    const s = savedFromAccount ?? DEFAULT_LINEAGE;
    setSaved(s);
    const local = cleanLineage(read(LINEAGE_KEY));
    if (!local) setDraftState(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, !!session.me]);

  const setDraft = useCallback((l: Lineage) => { setDraftState(l); write(l); }, []);
  const reset = useCallback(() => setDraft(DEFAULT_LINEAGE), [setDraft]);

  const dirty = !sameLineage(draft, saved);
  const unit: SaveUnit = {
    status: dirty ? "dirty" : "saved",
    state,
    error,
    save: async (token) => {
      setState("saving");
      setError(null);
      try {
        await call("/prefs", { token, body: { lineage: draft } });
        setSaved(draft);
        write(null);
        setState("idle");
        void session.refresh();
        return true;
      } catch (e) {
        setError(errorText(e));
        setState("error");
        return false;
      }
    },
  };
  return { draft, setDraft, reset, saved, dirty, custom: !sameLineage(draft, DEFAULT_LINEAGE), unit };
}

/** ממוצע המשתתפים — מהמקור האחד (src/lib/sources.ts) */
export const useCrowd = () => { const c = useCrowdAverage(); return { seats: c.seats, pct: c.pct }; };
export const useCrowdSeats = () => useCrowdAverage().seats;
