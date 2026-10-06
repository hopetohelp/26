import { useState } from "react";
import type { VotePayload } from "../../lib/crowdApi";
import { validateVote } from "../../lib/crowdValidate";
import { ALPHA, EMPTY_VOTE, IDS, K25_IDS, K25_LISTS, K25_PASSED, V2022_LABEL, V2026_LABEL, k25Name } from "./model";
import SaveButton from "./SaveButton";
import { inputCls, StatusPill } from "./ui";
import type { useSession, useUnit } from "./useCrowd";

function Choice({ name, value, current, label, onPick }: { name: string; value: string; current: string | null; label: string; onPick: (v: string) => void }) {
  const on = current === value;
  return (
    <label className={`flex items-center gap-2 min-h-[44px] px-3 rounded-full border-2 cursor-pointer text-sm font-bold ${on ? "bg-ink text-paper-card border-ink" : "bg-paper-card border-paper-line hover:border-ink-faint"}`}>
      <input type="radio" name={name} value={value} checked={on} onChange={() => onPick(value)} className="sr-only" />
      {label}
    </label>
  );
}

export default function Vote({ unit, session }: { unit: ReturnType<typeof useUnit<VotePayload>>; session: ReturnType<typeof useSession> }) {
  const p = unit.draft ?? EMPTY_VOTE;
  const set = (patch: Partial<VotePayload>) => unit.setDraft({ ...p, ...patch });
  const [q, setQ] = useState("");
  const found = q.trim() ? K25_LISTS.filter((l) => l.seats === 0 && (l.short + " " + l.name).includes(q.trim())).slice(0, 8) : [];
  const picked2022Other = p.v2022 && K25_IDS.includes(p.v2022) && !K25_PASSED.some((l) => l.letters === p.v2022);
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">שתי שאלות, כל אחת רשות. התשובה שלכם פרטית; רק ספירה מצטברת נכנסת לדשבורד, ותא שיש בו פחות מ-10 — מוסתר.</p>
      <fieldset>
        <legend className="font-display text-3xl leading-none mb-2">ב-2022 הצבעתי ל…</legend>
        <div className="flex flex-wrap gap-2">
          {K25_PASSED.map((l) => (
            <Choice key={l.letters} name="v2022" value={l.letters} current={p.v2022} label={l.short} onPick={(v) => set({ v2022: v })} />
          ))}
          {picked2022Other && <Choice name="v2022" value={p.v2022!} current={p.v2022} label={k25Name(p.v2022!)} onPick={() => {}} />}
        </div>
        <div className="mt-3 max-w-sm">
          <label className="text-sm font-bold block mb-1" htmlFor="q2022">
            רשימה שלא עברה את הסף? חפשו
          </label>
          <input id="q2022" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם הרשימה" />
          {found.length > 0 && (
            <ul className="mt-1 border border-paper-line rounded-theme bg-paper-card">
              {found.map((l) => (
                <li key={l.letters}>
                  <button type="button" className="w-full text-start px-3 min-h-[44px] hover:bg-paper" onClick={() => (set({ v2022: l.letters }), setQ(""))}>
                    {l.short}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(V2022_LABEL).map(([k, label]) => (
            <Choice key={k} name="v2022" value={k} current={p.v2022} label={label} onPick={(v) => set({ v2022: v })} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-display text-3xl leading-none mb-2">ב-2026 אני מתכוון/ת להצביע ל…</legend>
        <div className="flex flex-wrap gap-2">
          {ALPHA.map((l) => (
            <Choice key={l.id} name="v2026" value={l.id} current={p.v2026} label={l.name} onPick={(v) => set({ v2026: v })} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(V2026_LABEL).map(([k, label]) => (
            <Choice key={k} name="v2026" value={k} current={p.v2026} label={label} onPick={(v) => set({ v2026: v })} />
          ))}
        </div>
        <p className="text-xs text-ink-soft mt-2">הרשימות בסדר האלף-בית.</p>
      </fieldset>
      <div className="flex items-center gap-3 flex-wrap">
        <SaveButton unit={unit} session={session} invalid={validateVote(p, K25_IDS, IDS)} />
        <StatusPill status={unit.status} />
        {(p.v2022 || p.v2026) && (
          <button type="button" className="text-sm underline text-ink-soft min-h-[44px]" onClick={() => unit.setDraft(EMPTY_VOTE)}>
            ניקוי הבחירות
          </button>
        )}
      </div>
    </div>
  );
}
