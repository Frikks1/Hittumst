import * as Sentry from '@sentry/nextjs';
import { diagnosticConfiguration, sanitizeServerDiagnostic, type DiagnosticCode } from './diagnostics-policy';
let initialized = false;
const lastReported = new Map<string, number>();
export function initializeDiagnostics() {
  if (initialized) return;
  const config = diagnosticConfiguration(process.env);
  if (!config) return;
  Sentry.init({ ...config, sendDefaultPii: false, defaultIntegrations: false, integrations: [],
    skipOpenTelemetrySetup: true, tracesSampleRate: 0, enableLogs: false, maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null, beforeSendTransaction: () => null, beforeSend: sanitizeServerDiagnostic });
  initialized = true;
}
export function captureDiagnostic(code: DiagnosticCode, worker?: string) {
  initializeDiagnostics();
  const key = code + ':' + (worker ?? 'web');
  if (!initialized || Date.now() - (lastReported.get(key) ?? 0) < 60000) return;
  lastReported.set(key, Date.now());
  Sentry.captureEvent({ level: 'error', tags: { diagnostic_code: code, ...(worker ? { worker } : {}) } });
}
export async function flushDiagnostics() { if (initialized) await Sentry.flush(2000); }
