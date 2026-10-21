/** בדיקת פריסה ללא חשבון וללא שינוי הגדרת פתיחת הכתובת הציבורית. */
export async function checkMcpDeployment(base, request = fetch) {
  const get = (path, options = {}) => request(base + path, { ...options, signal: AbortSignal.timeout(15000) });
  const discovery = await get('/.well-known/oauth-authorization-server');
  if (!discovery.ok) throw new Error(`מסמך גילוי: HTTP ${discovery.status}`);
  const metadata = await discovery.json();
  if (metadata.issuer !== base) throw new Error('מסמך הגילוי אינו שייך לשרת הנבדק');
  const response = await get('/public', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  const body = await response.json();
  if (response.ok && body.result?.tools?.some(t => t.name === 'get_poll_average') && body.result.tools.some(t => t.name === 'get_locality_results')) return 'שרת ה-MCP עונה וכלי הנתונים החדשים זמינים';
  if (response.status === 403 && body.error?.data?.code === 'public_disabled') {
    const protectedResponse = await get('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
    if (protectedResponse.status === 401 && protectedResponse.headers.has('www-authenticate')) return 'שרת ה-MCP עונה; הכתובת הציבורית סגורה בהגדרת המנהל והכתובת לחשבון דורשת התחברות כמצופה';
    throw new Error(`הכתובת הציבורית סגורה, אך בדיקת ההתחברות לא תקינה: HTTP ${protectedResponse.status}`);
  }
  throw new Error(`כלי MCP אינם זמינים: HTTP ${response.status}, קוד ${body.error?.code ?? 'ללא קוד'}`);
}
