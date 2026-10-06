import { useState } from "react";
import { TOTAL } from "../../lib/fillAll";
import { IDS, nameOf } from "./model";
import { Btn } from "./ui";

/** שיתוף: רק המספרים של ההשערה, כטקסט, ורק בלחיצה — בלי קישור אישי ובלי שום פרט מזהה */
export default function Share({ values }: { values: Record<string, number> }) {
  const [done, setDone] = useState<string | null>(null);
  const link = `${location.origin}${location.pathname}#/guess?tab=dashboard`;
  const lines = IDS.filter((id) => values[id] > 0)
    .sort((a, b) => values[b] - values[a])
    .map((id) => `${nameOf(id)} ${values[id]}`);
  const text = `הכנסת שלי (${TOTAL}), השערה ולא סקר:\n${lines.join("\n")}\n\nומה מנחשים כל השאר?`;
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "ההשערה שלי לכנסת ה-26", text, url: link });
        setDone("שותף");
      } else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setDone("הועתק — אפשר להדביק בכל מקום");
      }
    } catch {
      /* המשתמש ביטל */
    }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Btn onClick={share}>שיתוף ההשערה</Btn>
      <span className="text-xs text-ink-soft" role="status">
        {done ?? "משתפים רק את המספרים, בלי הקישור האישי."}
      </span>
    </div>
  );
}
