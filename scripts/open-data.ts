/**
 * כותב את קובצי הנתונים הפתוחים ואת llms.txt לתיקיית הבנייה (dist), מתוך `src/lib/openData.ts` — מקור אמת אחד.
 * רץ בסוף `npm run build`. בפרסום (pages.yml), אחרי שהעותק של dashboard.json הועתק: `--dashboard` עוטף אותו ב-`about`.
 * MCP_URL (משתנה סביבה) = כתובת שרת ה-MCP, כשהוא קיים; בלעדיו האינדקס אומר "בבנייה".
 *
 *   npx vite-node scripts/open-data.ts               # dist/data/*.json, dist/data/index.json, dist/llms.txt
 *   npx vite-node scripts/open-data.ts --dashboard   # עוטף את הקבצים החיצוניים שקיימים ב-dist
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OPEN_FILES, buildFile, buildIndex, buildLlmsTxt, wrapExternal } from "../src/lib/openData";

const OUT = process.env.OUT_DIR ?? "dist";
const mcp = process.env.MCP_URL?.trim() || null;
const write = (path: string, body: string) => {
  const p = join(OUT, path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
};

if (process.argv.includes("--dashboard")) {
  for (const f of OPEN_FILES.filter(x => !x.build)) {
    const p = join(OUT, f.path);
    if (existsSync(p)) {
      write(f.path, JSON.stringify(wrapExternal(f, JSON.parse(readFileSync(p, "utf8")))));
      console.log(`עטיפה: ${f.path}`);
    } else console.log(`${f.path} אינו קיים — אין מה לעטוף`);
  }
} else {
  for (const f of OPEN_FILES) {
    if (!f.build) continue;
    write(f.path, JSON.stringify(buildFile(f)));
  }
  write("data/index.json", JSON.stringify(buildIndex(mcp), null, 1));
  write("llms.txt", buildLlmsTxt(mcp));
  console.log(`קובצי נתונים פתוחים: ${OPEN_FILES.filter((f) => f.build).length} + index.json + llms.txt ⇐ ${OUT}/`);
}
