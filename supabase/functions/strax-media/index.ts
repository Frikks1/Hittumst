import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse } from "../_shared/http.ts";

type Detail = { id: string; status: string; photoStatus: string; photoPath: string | null; expiresAt: string; serverNow: string };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function key(variable: string, fallback: string) {
  const modern = Deno.env.get(variable);
  const value = modern ? (JSON.parse(modern) as Record<string, string>).default : Deno.env.get(fallback);
  if (!value) throw new Error("Missing function configuration");
  return value;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parseDetail(value: unknown, id: string): Detail | null {
  const item = record(value);
  if (item.id !== id || item.status !== "active" || item.photoStatus !== "approved" || typeof item.photoPath !== "string" ||
    !item.photoPath.startsWith(id + "/") || typeof item.expiresAt !== "string" || typeof item.serverNow !== "string" ||
    !Number.isFinite(Date.parse(item.expiresAt)) || !Number.isFinite(Date.parse(item.serverNow))) return null;
  return item as unknown as Detail;
}
/** Storage returns a trusted token, but its TTL is relative to the storage clock. */
function signedExpiration(url: string, origin: string, path: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin || decodeURIComponent(parsed.pathname) !== "/storage/v1/object/sign/strax-media/" + path) return null;
    const payload = parsed.searchParams.get("token")?.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = record(JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))));
    return Number.isSafeInteger(claims.exp) ? Number(claims.exp) * 1000 : null;
  } catch { return null; }
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) {
    options.headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    return options;
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required" }, 401);
  try {
    const backendUrl = Deno.env.get("SUPABASE_URL");
    if (!backendUrl) throw new Error("Missing function configuration");
    const settings = { auth: { persistSession: false, autoRefreshToken: false } };
    const member = createClient(backendUrl, key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
      ...settings, global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await member.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return jsonResponse({ error: "Authentication required" }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    const input = record(body);
    if (Object.keys(input).length !== 1 || !Array.isArray(input.activityIds) || input.activityIds.length > 40 ||
      input.activityIds.some(id => typeof id !== "string" || !uuid.test(id))) return jsonResponse({ error: "Invalid request" }, 400);
    const ids = [...new Set(input.activityIds as string[])];
    const admin = createClient(backendUrl, key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), settings);
    const photos = await Promise.all(ids.map(async activityId => {
      try {
        // Authorization runs with the caller's JWT, including session revocation,
        // location readiness, host visibility, blocks and the publication deadline.
        for (let attempt = 0; attempt < 2; attempt++) {
          const started = performance.now();
          const { data, error } = await member.rpc("strax_get", { p_id: activityId });
          const detail = error ? null : parseDetail(data, activityId);
          if (!detail) return null;
          const deadline = Date.parse(detail.expiresAt);
          const current = Date.parse(detail.serverNow) + Math.max(0, performance.now() - started);
          const lifetime = Math.min(300, Math.floor((deadline - current) / 1000) - 1 - attempt);
          if (lifetime <= 0) return null;
          const signed = await admin.storage.from("strax-media").createSignedUrl(detail.photoPath!, lifetime);
          const url = signed.error ? null : signed.data?.signedUrl;
          const expiration = typeof url === "string" ? signedExpiration(url, new URL(backendUrl).origin, detail.photoPath!) : null;
          if (!expiration || expiration > deadline) continue;
          // A block, logout or expiry during signing must suppress the result.
          const fresh = await member.rpc("strax_get", { p_id: activityId });
          const next = fresh.error ? null : parseDetail(fresh.data, activityId);
          if (!next || next.photoPath !== detail.photoPath || expiration > Date.parse(next.expiresAt) || expiration <= Date.parse(next.serverNow)) return null;
          return { activityId, url };
        }
      } catch { /* An unavailable optional photo does not hide the activity text. */ }
      return null;
    }));
    return jsonResponse({ photos: photos.filter(photo => photo !== null) });
  } catch { return jsonResponse({ error: "Media signing unavailable" }, 503); }
});
