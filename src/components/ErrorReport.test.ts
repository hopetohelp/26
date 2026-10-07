import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => { vi.unstubAllEnvs(); });

it("מציג כפתור דיווח לצד שגיאת הרשמה כשיש לוג", async () => {
  vi.stubEnv("VITE_FEEDBACK_URL", "https://feedback.example");
  vi.resetModules();
  const { default: ErrorReport } = await import("./ErrorReport");
  const html = renderToStaticMarkup(createElement(ErrorReport, { error: "אין חיבור לשרת", errorLog: '{"action":"הרשמה"}' }));
  expect(html).toContain('role="alert"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain("שליחת הערה עם לוג התקלה");
});
