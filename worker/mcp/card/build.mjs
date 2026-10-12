// node worker/mcp/card/build.mjs ⇐ worker/mcp/lib/card.generated.js (אין לערוך ביד)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildCardHtml } from "./template.mjs";

const r = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const html = buildCardHtml({ indexCss: r("../../../src/index.css"), cardCss: r("./card.css"), cardJs: r("./card.js"), site: "https://hopetohelp.github.io/26/" });
const hash = createHash("sha256").update(html).digest("hex");
writeFileSync(new URL("../lib/card.generated.js", import.meta.url), `// נגזר מ-worker/mcp/card (node worker/mcp/card/build.mjs). אין לערוך ביד.\nexport const CARD_HTML = ${JSON.stringify(html)};\nexport const CARD_HASH = "${hash}";\n`);
console.log(`כרטיס: ${html.length} תווים, ${hash.slice(0, 8)}`);
