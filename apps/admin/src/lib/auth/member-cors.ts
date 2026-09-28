/** Exact browser origins only. Native bearer requests have no Origin header. */
export function memberCors(request: Request, method: 'GET' | 'POST') {
  const headers = new Headers({ 'Cache-Control':'private, no-store', Vary:'Origin', 'Access-Control-Allow-Methods':`${method}, OPTIONS`, 'Access-Control-Allow-Headers':'Authorization, Content-Type' });
  const origin = request.headers.get('origin');
  if (!origin) return { allowed:true, headers };
  const configured = (process.env.MEMBER_WEB_ORIGINS ?? '').split(',').map(value => value.trim()).filter(value => {
    try {
      const url = new URL(value);
      const local = process.env.HITTUMST_APP_ENV === 'development' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname);
      return value === url.origin && !url.username && !url.password && (url.protocol === 'https:' || local);
    } catch { return false; }
  });
  const allowed = origin === new URL(request.url).origin || configured.includes(origin);
  if (allowed) headers.set('Access-Control-Allow-Origin', origin);
  return { allowed, headers };
}
export function memberPreflight(request: Request, method: 'GET' | 'POST') {
  const cors = memberCors(request, method);
  const requested = request.headers.get('access-control-request-method');
  const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowed = cors.allowed && (!requested || requested === method) && requestedHeaders.every(value => ['authorization','content-type'].includes(value));
  return new Response(null, { status:allowed ? 204 : 403, headers:cors.headers });
}
