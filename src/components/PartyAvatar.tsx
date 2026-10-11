import { PARTY_IMAGES } from "../lib/partyImages";

/**
 * תמונת הרשימה: ראש הרשימה בעיגול, או הסמל שלם על רקע כרטיס. אין תמונה לרשימה ⇐ לא מוצג כלום (המקום נשמר, כדי שהשמות יישארו מיושרים).
 * מהטוקנים בלבד, בלי צבע קבוע ובלי מסגרת (הכרעת בעלים 11.10.2026). התמונה לקישוט: השם כבר כתוב לידה, ולכן alt ריק.
 */
export function PartyAvatar({ id, size = 36 }: { id: string; size?: number }) {
  const img = PARTY_IMAGES[id];
  const box = { width: size, height: size };
  if (!img) return <span aria-hidden="true" className="shrink-0" style={box} />;
  const src = `${import.meta.env.BASE_URL}${img.file}`;
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full bg-paper-card ${img.kind === "logo" ? "p-1" : ""}`}
      style={box}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={img.kind === "logo" ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover object-top"}
      />
    </span>
  );
}

/**
 * תמונת הרשימה בעיגול שקוטרו חצי מגובה המיכל (הכרעת בעלים 11.10.2026): הדו-קרב ברוחב מ-1024px וכרטיס הרשימה על הסף.
 * המיכל קובע את הגובה (`self-stretch`) והרוחב, והעיגול ממורכז בו. ראש הרשימה נחתך מלמעלה, סמל מוצג שלם. בלי מסגרת. לקישוט (alt ריק).
 */
export function PartyPhoto({ id, className = "" }: { id: string; className?: string }) {
  const img = PARTY_IMAGES[id];
  if (!img) return null;
  return (
    <span aria-hidden="true" className={`items-center justify-center ${className}`}>
      <span className="relative block h-1/2 max-w-full aspect-square overflow-hidden rounded-full bg-paper-card">
        <img
          src={`${import.meta.env.BASE_URL}${img.file}`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full ${img.kind === "logo" ? "object-contain p-2" : "object-cover object-top"}`}
        />
      </span>
    </span>
  );
}
