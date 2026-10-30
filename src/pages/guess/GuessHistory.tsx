import { useEffect, useMemo, useState } from "react";
import { call, type Version } from "../../lib/crowdApi";
import { dateTime } from "../../lib/format";
import { hasResults, results2026 } from "../../lib/guessAccuracyData";
import { guessLabel, guessRows, guessScore, numberGuesses, type NumberedGuess } from "../../lib/guessHistory";
import { PartyAvatar } from "../../components/PartyAvatar";
import GuessPost, { type PostResults } from "./GuessPost";
import { nameOf } from "./model";
import { Btn, Notice } from "./ui";
import { errorText, type useSession } from "./useCrowd";

/** על מה מבוססות תוצאות האמת עכשיו: ספירה חלקית (מתעדכנת) או תוצאות סופיות; האחוז המדויק של הנספרים במסך "תוצאות" */
const resultsBasis = () => (results2026.status === "final" ? "לפי התוצאות הסופיות" : "לפי הספירה הנוכחית");

/**
 * מגירת "היסטוריית ניחושים" באזור האישי: כל ניחוש שנשמר — מספרו (3/5), תאריך ושעת השמירה, הדיוק מול תוצאות האמת
 * (מנדטים ומפלגות מדויקים), טבלת המפלגות, וכפתור ליצירת פוסט.
 */
export default function GuessHistory({ session }: { session: ReturnType<typeof useSession> }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [post, setPost] = useState<NumberedGuess | null>(null);
  useEffect(() => {
    if (!session.online || !session.token) return;
    let active = true;
    setErr(null);
    setVersions(null);
    call<{ versions: Version[] }>("/history?unit=seats", { token: session.token })
      .then((r) => { if (active) setVersions(r.versions); })
      .catch((e) => { if (active) setErr(errorText(e)); });
    return () => { active = false; };
  }, [session.online, session.token]);

  const ready = hasResults();
  const results = useMemo<PostResults>(() => ({ actual: ready ? results2026.seats : null, basis: resultsBasis() }), [ready]);
  const guesses = useMemo(() => numberGuesses(versions ?? []), [versions]);

  if (!session.online) return <Notice>ההיסטוריה תופיע כשהשמירה תיפתח באתר.</Notice>;
  if (!session.token) return <p className="text-sm text-ink-soft">בלי חשבון הניחושים נשמרים רק בדפדפן הזה, ואין להם היסטוריה.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        {ready ? <>הדיוק מחושב מול תוצאות האמת {results.basis}.</> : "הדיוק יופיע עם התוצאות הראשונות."}
        {" "}הניחוש האחרון הוא היחיד שנספר בסטטיסטיקות הכלליות.
      </p>
      {err && <Notice tone="warn">{err}</Notice>}
      {versions === null && !err && <p className="text-ink-soft text-sm">טוען…</p>}
      {versions?.length === 0 && <Notice>עוד לא נשמר ניחוש. אחרי השמירה הראשונה, כל ניחוש יופיע כאן.</Notice>}
      <ul className="space-y-3">
        {guesses.map((g) => <li key={g.version.id}><GuessCard g={g} actual={results.actual} onPost={() => setPost(g)} latest={g.n === g.total} /></li>)}
      </ul>
      {post && <GuessPost guess={post} results={results} onClose={() => setPost(null)} />}
    </div>
  );
}

function GuessCard({ g, actual, latest, onPost }: { g: NumberedGuess; actual: Record<string, number> | null; latest: boolean; onPost: () => void }) {
  const score = actual ? guessScore(g.values, actual) : null;
  const rows = guessRows(g.values, actual);
  return (
    <article className="border border-paper-line rounded-theme bg-paper-card p-4 space-y-3" aria-label={guessLabel(g.n, g.total)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-tight">{guessLabel(g.n, g.total)}</h3>
          <p className="text-sm text-ink-soft tabular"><bdi dir="ltr">{dateTime(g.version.created_at)}</bdi></p>
        </div>
        {latest && <span className="shrink-0 text-xs font-bold border border-ink rounded-full px-2 py-0.5">האחרון — נספר</span>}
      </header>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <Tile label="מנדטים מדויקים" value={score?.seats} of={score ? "מתוך 120" : undefined} />
        <Tile label="מפלגות מדויקות" value={score?.lists} of={score ? `מתוך ${score.passed}` : undefined} />
      </dl>
      <details className="group [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] font-bold text-sm">
          <span>המפלגות: הניחוש ותוצאות האמת</span>
          <span aria-hidden="true" className="text-ink-soft text-lg transition-transform group-open:rotate-45">+</span>
        </summary>
        <table className="w-full text-sm tabular">
          <thead><tr className="text-ink-soft"><th className="text-start font-normal">רשימה</th><th className="font-normal">הניחוש</th><th className="font-normal">האמת</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-paper-line">
                <td className="py-1.5"><span className="flex items-center gap-2"><PartyAvatar id={r.id} size={24} />{nameOf(r.id)}</span></td>
                <td className={`text-center ${r.exact ? "font-bold" : ""}`}>{r.guess}{r.exact && <span className="sr-only"> (מדויק)</span>}</td>
                <td className="text-center">{actual ? r.actual : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <Btn onClick={onPost}>יצירת פוסט</Btn>
    </article>
  );
}

function Tile({ label, value, of }: { label: string; value?: number; of?: string }) {
  return (
    <div className="rounded-theme border border-paper-line px-2 py-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-2xl font-bold font-num leading-tight">{value ?? "—"}</dd>
      {of && <dd className="text-xs text-ink-soft">{of}</dd>}
    </div>
  );
}
