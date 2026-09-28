import { createClient } from '@supabase/supabase-js';

/** Always send the caller's bearer token through the Data API authorization boundary. */
export function memberDatabase(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) throw new Error('backend_unavailable');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }), headers: { Authorization: `Bearer ${token}` } },
  });
}
