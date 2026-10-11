import { PARTY_IMAGES } from "../lib/partyImages";

/**
 * תמונת הרשימה: ראש הרשימה בעיגול, או הסמל שלם על רקע כרטיס. אין תמונה לרשימה ⇐ לא מוצג כלום (המקום נשמר, כדי שהשמות יישארו מיושרים).
 * מהטוקנים בלבד, בלי צבע קבוע. התמונה לקישוט: השם כבר כתוב לידה, ולכן alt ריק.
 */
export function PartyAvatar({ id, size = 36 }: { id: string; size?: number }) {
  const img = PARTY_IMAGES[id];
  const box = { width: size, height: size };
  if (!img) return <span aria-hidden="true" className="shrink-0" style={box} />;
  const src = `${import.meta.env.BASE_URL}${img.file}`;
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full bg-paper-card shadow-[inset_0_0_0_1px_rgb(var(--paper-line))] ${img.kind === "logo" ? "p-1" : ""}`}
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
