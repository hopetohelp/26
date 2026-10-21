import { checkMcpDeployment } from './lib/smoke.js';
const base = 'https://elections26-mcp.hopetohelp-il.workers.dev';
let last;
for (let attempt = 0; attempt < 12; attempt++) {
  try { console.log(await checkMcpDeployment(base)); process.exit(0); }
  catch (e) { last = e; console.error(`ניסיון ${attempt + 1}: ${e.message}`); }
  if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
}
throw last;
