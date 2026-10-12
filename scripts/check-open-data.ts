/**
 * בדיקה: כל קובץ שבאינדקס (data/index.json) קיים בתיקיית הבנייה ועדכני — `checkOpenData` ב-`src/lib/openData.ts`.
 *   npx vite-node scripts/check-open-data.ts                    # אחרי npm run build (CI)
 *   npx vite-node scripts/check-open-data.ts -- --with-dashboard # בפרסום, אחרי שהעותק של dashboard.json נעטף
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkOpenData, validAnchors } from "../src/lib/openData";

const OUT = process.env.OUT_DIR ?? "dist";
const read = (p: string) => (existsSync(join(OUT, p)) ? readFileSync(join(OUT, p), "utf8") : null);
const errors = checkOpenData(read, { withDashboard: process.argv.includes("--with-dashboard"), anchors: validAnchors() });
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log("✓ כל קובצי האינדקס קיימים ועדכניים");
