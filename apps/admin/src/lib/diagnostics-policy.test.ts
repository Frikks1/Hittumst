import { describe, expect, it } from 'vitest';
import { diagnosticConfiguration, sanitizeServerDiagnostic } from './diagnostics-policy';
describe('server diagnostic privacy boundary', () => {
  it('drops all events which do not carry an allowlisted code', () => {
    expect(sanitizeServerDiagnostic({ message: 'private member message', exception: { values: [{ value: 'credential' }] } })).toBeNull();
  });
  it('rebuilds an allowlisted event without any private fields or attachments', () => {
    const result = sanitizeServerDiagnostic({ message: 'private', request: { url: 'https://private', data: 'message', headers: { authorization: 'token' } },
      user: { email: 'member@example.com', ip_address: '1.2.3.4' }, breadcrumbs: [{ message: 'private' }],
      extra: { body: 'private' }, contexts: { data: { path: 'private' } }, transaction: '/private', server_name: 'private',
      exception: { values: [{ value: 'private', stacktrace: { frames: [{ filename: 'private', vars: { secret: 'private' } }] } }] },
      tags: { diagnostic_code: 'worker_cycle_failed', worker: 'media', secret: 'private' },
      environment: 'production', release: 'a'.repeat(40), event_id: 'b'.repeat(32) });
    expect(result).toEqual({ environment: 'production', release: 'a'.repeat(40), event_id: 'b'.repeat(32),
      level: 'error', message: 'worker_cycle_failed', tags: { diagnostic_code: 'worker_cycle_failed', worker: 'media' },
      fingerprint: ['worker_cycle_failed', 'media'] });
    expect(JSON.stringify(result)).not.toMatch(/private|token|member@example/);
  });
  it('drops unrecognized metadata and requires explicit EU project opt-in', () => {
    expect(sanitizeServerDiagnostic({ tags: { diagnostic_code: 'server_request_failed', worker: 'member-id' }, release: 'member-id', environment: 'member-id' }))
      .toEqual({ level: 'error', message: 'server_request_failed', tags: { diagnostic_code: 'server_request_failed', worker: 'web' }, fingerprint: ['server_request_failed', 'web'] });
    const config = { SENTRY_DSN: 'https://public@o1.ingest.de.sentry.io/1', SENTRY_ENABLED: 'true', HITTUMST_APP_ENV: 'staging' };
    expect(diagnosticConfiguration(config)).not.toBeNull();
    expect(diagnosticConfiguration({ ...config, SENTRY_ENABLED: 'false' })).toBeNull();
    expect(diagnosticConfiguration({ ...config, SENTRY_DSN: 'https://public@o1.ingest.us.sentry.io/1' })).toBeNull();
    expect(diagnosticConfiguration({ ...config, SENTRY_DSN: 'https://public@attacker.example/1' })).toBeNull();
  });
});
