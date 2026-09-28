import type { Event, ErrorEvent } from '@sentry/nextjs';
export const diagnosticCodes = ['server_request_failed', 'worker_cycle_failed', 'worker_result_failed',
  'worker_heartbeat_failed', 'operations_backend_unavailable'] as const;
export type DiagnosticCode = (typeof diagnosticCodes)[number];
const workers = ['account-deletion', 'media', 'commerce', 'push', 'voice', 'billing'];
/** Rebuild from a tiny allowlist: no raw error, stack, request, user, URL, body or breadcrumbs. */
export function sanitizeServerDiagnostic(event: Event): ErrorEvent | null {
  const code = event.tags?.diagnostic_code;
  if (typeof code !== 'string' || !(diagnosticCodes as readonly string[]).includes(code)) return null;
  const worker = typeof event.tags?.worker === 'string' && workers.includes(event.tags.worker) ? event.tags.worker : 'web';
  return {
    type: undefined,
    ...(typeof event.event_id === 'string' && /^[a-f0-9]{32}$/.test(event.event_id) ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) ? { timestamp: event.timestamp } : {}),
    ...(typeof event.release === 'string' && /^[a-f0-9]{40,64}$/.test(event.release) ? { release: event.release } : {}),
    ...(event.environment === 'staging' || event.environment === 'production' ? { environment: event.environment } : {}),
    level: 'error', message: code, tags: { diagnostic_code: code, worker }, fingerprint: [code, worker],
  };
}
export function diagnosticConfiguration(env: Record<string, string | undefined>) {
  let dsn: URL;
  try { dsn = new URL(env.SENTRY_DSN ?? ''); } catch { return null; }
  if (env.SENTRY_ENABLED !== 'true' || !['staging', 'production'].includes(env.HITTUMST_APP_ENV ?? '') ||
    dsn.protocol !== 'https:' || !dsn.hostname.endsWith('.ingest.de.sentry.io') || !dsn.username || dsn.password || !/^\/[0-9]+$/.test(dsn.pathname) || dsn.search || dsn.hash)
    return null;
  return { dsn: dsn.href, environment: env.HITTUMST_APP_ENV,
    release: /^[a-f0-9]{40,64}$/.test(env.RENDER_GIT_COMMIT ?? '') ? env.RENDER_GIT_COMMIT : undefined };
}
