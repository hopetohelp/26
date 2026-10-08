import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("שגיאה בטעינת מסך", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="rounded-theme border border-paper-line bg-paper-card p-6 space-y-4">
      <h1 className="font-display text-4xl">המסך לא נטען</h1>
      <p>אירעה תקלה בטעינת המסך. אפשר לרענן או לעבור למסך אחר.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-full bg-ink text-paper-card px-5 font-bold">רענון המסך</button>
        <Link to="/" className="min-h-[44px] flex items-center px-3 font-bold underline">חזרה לבית</Link>
      </div>
    </section>;
  }
}

/** כשל במסך משאיר את הניווט זמין; מעבר למסך או ללשונית אחרת מאפשר ניסיון חדש. */
export default function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();
  return <Boundary key={pathname + search + hash}>{children}</Boundary>;
}
