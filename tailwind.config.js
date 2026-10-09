/** @type {import('tailwindcss').Config} */
// הצבעים והגופנים הם משתני CSS — שלושת העיצובים (לוח · טבלה · קופסאות) מחליפים אותם ב-src/index.css
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
        num: ["var(--font-num)", "var(--font-body)", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), faint: v("ink-faint") },
        paper: { DEFAULT: v("paper"), card: v("card"), line: v("line") },
        accent: { DEFAULT: v("accent"), soft: v("accent-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        pos: v("pos"),
        neg: v("neg"),
        frame: { DEFAULT: v("frame"), ink: v("frame-ink"), soft: v("frame-soft"), line: v("frame-line") },
        signal: { DEFAULT: v("signal"), ink: v("signal-ink") },
        band: { DEFAULT: v("band"), ink: v("band-ink"), soft: v("band-soft") },
      },
      borderRadius: { theme: "var(--radius)" },
    },
  },
  plugins: [],
};
