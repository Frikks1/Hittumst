import { afterEach, describe, expect, it, vi } from 'vitest';
import { memberCors, memberPreflight } from './member-cors';
afterEach(() => vi.unstubAllEnvs());
const request = (origin: string, extra: Record<string,string> = {}) => new Request('https://admin.example.test/api/account/media/file', { headers: { Origin:origin, ...extra } });
describe('member API origin policy', () => {
  it('permits native bearer and same-origin browser requests without a wildcard', () => {
    expect(memberCors(new Request('https://admin.example.test'), 'GET').allowed).toBe(true);
    const same = memberCors(request('https://admin.example.test'), 'GET');
    expect(same.allowed).toBe(true); expect(same.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.test');
    expect(same.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('accepts exact configured HTTPS origins and rejects lookalikes, wildcards, and HTTP in staging', () => {
    vi.stubEnv('MEMBER_WEB_ORIGINS', 'https://app.example.test,*,http://localhost:8081'); vi.stubEnv('HITTUMST_APP_ENV', 'staging');
    expect(memberCors(request('https://app.example.test'), 'GET').allowed).toBe(true);
    for (const origin of ['https://app.example.test.evil.test', 'null', 'http://localhost:8081']) expect(memberCors(request(origin), 'GET').allowed).toBe(false);
  });
  it('allows explicit local development preflights while rejecting other methods and headers', () => {
    vi.stubEnv('MEMBER_WEB_ORIGINS', 'http://localhost:8081'); vi.stubEnv('HITTUMST_APP_ENV', 'development');
    expect(memberPreflight(request('http://localhost:8081', { 'access-control-request-method':'GET', 'access-control-request-headers':'authorization' }), 'GET').status).toBe(204);
    expect(memberPreflight(request('http://localhost:8081', { 'access-control-request-method':'DELETE' }), 'GET').status).toBe(403);
    expect(memberPreflight(request('http://localhost:8081', { 'access-control-request-headers':'x-untrusted' }), 'GET').status).toBe(403);
  });
});
