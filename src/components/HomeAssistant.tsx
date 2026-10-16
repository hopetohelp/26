import { useRef } from "react";
import PrivateChat, { PrivateKeyEntry } from "../pages/PrivateChat";
import { usePrivateKey } from "../lib/privateChat";

export default function HomeAssistant() {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = usePrivateKey();
  return <>
    <button type="button" className="c-chart-link" onClick={() => dialog.current?.showModal()}>יש שאלה? שאלו את הצ׳ט החכם ←</button>
    <dialog ref={dialog} className="c-assistant" aria-labelledby="home-assistant-title">
      <div className="flex items-center justify-between gap-4 mb-4"><h2 id="home-assistant-title" className="font-display text-2xl">מה תרצו להבין?</h2><button type="button" autoFocus className="c-chart-link" onClick={() => dialog.current?.close()} aria-label="סגירת הצ׳ט">×</button></div>
      <p className="text-sm text-ink-soft mb-4">אפשר לשאול על הסקרים, התרחישים והחישובים. זו שיחה פרטית באמצעות מפתח AI אישי, על חשבונכם.</p>
      {key ? <div className="flex flex-col min-h-80"><PrivateChat /></div> : <PrivateKeyEntry />}
    </dialog>
  </>;
}
