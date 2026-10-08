/**
 * צבעים קבועים לכל רשימה — **ניטרליים במכוון, לא צבעי המפלגות**, כדי שהאתר לא ייראה כתעמולה.
 * הזיהוי תמיד לפי השם (תוויות ישירות), והצבע הוא ערוץ משני.
 */
const PALETTE: Record<string, string> = {
  likud: "#3f6e9e",
  yashar: "#c06a2b",
  together: "#2e8b7a",
  democrats: "#8e5aa8",
  yb: "#7a7f2b",
  shas: "#a8445a",
  utj: "#5a6b3d",
  otzma: "#b08a2e",
  rzp: "#4d4d8f",
  joint: "#3a8f4f",
  raam: "#6b8fb3",
  reservists: "#9a6b4a",
  bluewhite: "#5f9ea0",
  amcha: "#a0668a",
  haredi_public: "#777777",
  noam: "#c07a50",
  code_black: "#3d3d3d",
};
const FALLBACK = ["#4c78a8", "#f58518", "#54a24b", "#b279a2", "#9d755d", "#e45756", "#72b7b2", "#bab0ac"];

export function colorOf(id: string, i = 0): string {
  return PALETTE[id] ?? FALLBACK[i % FALLBACK.length];
}
