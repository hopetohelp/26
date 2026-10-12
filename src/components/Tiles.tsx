/** תיבות מספרים במסך הניהול: כותרת, הערה קטנה, ותיבה לכל מספר */
export function Tiles({ title, note, tiles }: { title: string; note: string; tiles: [string, string | number][] }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3 className="flex items-baseline gap-2 flex-wrap"><span className="font-display text-xl">{title}</span><span className="text-xs text-ink-soft">{note}</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(([label, n]) => (
          <div key={label} className="bg-paper-card border border-paper-line rounded-theme p-3">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="font-num tabular text-3xl leading-none mt-1">{n}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
