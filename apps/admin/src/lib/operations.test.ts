import { describe, it, expect } from 'vitest';
import { operationsHealth } from './operations';
const env = {
  CRON_SECRET: 'fixture-staging-secret-'.repeat(2),
  HITTUMST_APP_ENV: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
};
const authorization = 'Bearer ' + env.CRON_SECRET;
describe('authenticated operations health', () => {
  it('reveals only verified deployment identity to its worker', () => {
    expect(operationsHealth(env, authorization)).toEqual({
      status: 200,
      body: { status: 'ok', appEnvironment: 'staging', supabaseProjectRef: 'abcdefghijklmnopqrst' },
    });
  });
  it('denies absent, wrong and malformed credentials', () => {
    for (const value of [null, 'Bearer wrong', 'bearer ' + env.CRON_SECRET])
      expect(operationsHealth(env, value).status).toBe(401);
    expect(operationsHealth({ ...env, CRON_SECRET: 'short' }, authorization).status).toBe(503);
  });
  it('fails closed on missing environment and mislabeled production', () => {
    for (const change of [
      { HITTUMST_APP_ENV: 'development' },
      { HITTUMST_APP_ENV: undefined },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://yztxwdhajgoqvtsqmcdw.supabase.co' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://user:password@abcdefghijklmnopqrst.supabase.co' },
    ])
      expect(operationsHealth({ ...env, ...change }, authorization)).toEqual({
        status: 503,
        body: { error: 'operations_unavailable' },
      });
  });
  it('reports a production identity so a staging worker can reject it', () => {
    expect(
      operationsHealth(
        {
          ...env,
          HITTUMST_APP_ENV: 'production',
          NEXT_PUBLIC_SUPABASE_URL: 'https://yztxwdhajgoqvtsqmcdw.supabase.co',
        },
        authorization,
      ).body,
    ).toEqual({
      status: 'ok',
      appEnvironment: 'production',
      supabaseProjectRef: 'yztxwdhajgoqvtsqmcdw',
    });
  });
});
