import { runtimeEnv } from './env';
import { supabase } from './supabase';

/** Only the configured first-party origin may receive a session bearer token. */
export async function memberRequest(path: string, body?: unknown, expectedAccountId?: string): Promise<unknown> {
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path) || !runtimeEnv.websiteUrl) throw new Error('service_unavailable');
  const origin = new URL(runtimeEnv.websiteUrl);
  const local = runtimeEnv.appEnvironment === 'development' && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.port === '3001';
  if ((!local && (origin.protocol !== 'https:' || origin.port)) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('service_unavailable');
  const session = await supabase?.auth.getSession();
  if (!session?.data.session || session.error) throw new Error('authentication_required');
  const accountId = session.data.session.user.id;
  if (expectedAccountId && accountId !== expectedAccountId) throw new Error('authentication_required');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25000);
  let response: Response;
  try { response = await fetch(`${origin.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${session.data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal,
  });
  } finally { clearTimeout(timeout); }
  const current = await supabase?.auth.getSession();
  if (!current?.data.session || current.data.session.user.id !== accountId) throw new Error('authentication_required');
  if (!response.ok) throw new Error('service_unavailable');
  return response.json();
}
