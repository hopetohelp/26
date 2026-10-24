import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportCrash } from "../lib/crowdApi";

/**
 * רשת ביטחון לכל האתר: קריסה מחוץ למסך עצמו (כותרת, ניווט, חלונות) מציגה הודעה וכפתור רענון במקום מסך לבן.
 * קריסה בתוך מסך נתפסת קודם ב-PageErrorBoundary, והניווט נשאר זמין.
 */
export default class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("שגיאה באתר", error, info.componentStack);
    reportCrash("root", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main dir="rtl" className="min-h-screen bg-paper text-ink px-4 py-16 flex items-center justify-center">
      <section role="alert" className="w-full max-w-xl rounded-theme border border-paper-line bg-paper-card p-6 space-y-4">
        <h1 className="font-display text-4xl">משהו השתבש</h1>
        <p>אירעה תקלה בטעינת האתר. המידע שלכם שמור; רענון יטען את האתר מחדש.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-full bg-ink text-paper-card px-5 font-bold">רענון</button>
          <a href="#/" onClick={() => setTimeout(() => window.location.reload(), 0)} className="min-h-[44px] flex items-center px-3 font-bold underline">חזרה לבית</a>
        </div>
      </section>
    </main>;
  }
}
