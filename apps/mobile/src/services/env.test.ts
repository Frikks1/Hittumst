import { describe, expect, it } from 'vitest';
import { readRuntimeEnvironment } from './env';

const liveEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.test',
  EXPO_PUBLIC_WEBSITE_URL: 'https://example.test',
};

describe('readRuntimeEnvironment', () => {
  it('uses seeded demo data when Supabase is not configured', () => {
    const result = readRuntimeEnvironment({});

    expect(result.isDemo).toBe(true);
    expect(result.bypassAuth).toBe(false);
  });

  it('enables the auth bypass and seeded data explicitly in development', () => {
    const result = readRuntimeEnvironment({
      ...liveEnvironment,
      EXPO_PUBLIC_APP_ENV: 'development',
      EXPO_PUBLIC_DEV_BYPASS_AUTH: ' true ',
    });

    expect(result.isDemo).toBe(true);
    expect(result.bypassAuth).toBe(true);
    expect(result.supabaseUrl).toBeNull();
    expect(result.supabasePublishableKey).toBeNull();
  });

  it.each(['staging', 'production'] as const)('ignores the auth bypass in %s', (appEnvironment) => {
    const result = readRuntimeEnvironment({
      ...liveEnvironment,
      EXPO_PUBLIC_APP_ENV: appEnvironment,
      EXPO_PUBLIC_DEV_BYPASS_AUTH: 'true',
    });

    expect(result.isDemo).toBe(false);
    expect(result.bypassAuth).toBe(false);
    expect(result.supabaseUrl).toBe(liveEnvironment.EXPO_PUBLIC_SUPABASE_URL);
  });

  it('reads the public MapTiler browser/mobile key without changing demo selection', () => {
    const result = readRuntimeEnvironment({ EXPO_PUBLIC_MAPTILER_KEY: ' maptiler-public-key ' });

    expect(result.mapTilerApiKey).toBe('maptiler-public-key');
    expect(result.isDemo).toBe(true);
  });
});

describe('production failure handling', () => {
  it('requires usable public support and policy destinations in production', () => {
    const production = { ...liveEnvironment, EXPO_PUBLIC_APP_ENV: 'production' };
    expect(readRuntimeEnvironment(production).configurationIssue).toBeNull();
    expect(readRuntimeEnvironment({ ...production, EXPO_PUBLIC_SUPPORT_EMAIL: '' }).configurationIssue).not.toBeNull();
    expect(readRuntimeEnvironment({ ...production, EXPO_PUBLIC_WEBSITE_URL: 'javascript:alert(1)' }).websiteUrl).toBeNull();
    expect(readRuntimeEnvironment({}).supportEmail).toBe('');
  });
  it.each(['staging','production'])('does not fall back to fake users in %s', mode => {
    const result=readRuntimeEnvironment({EXPO_PUBLIC_APP_ENV:mode});
    expect(result.isDemo).toBe(false);expect(result.configurationIssue).not.toBeNull();
  });
  it.each(['sb_secret_sensitive','header.service_role.signature','header.anon.signature'])('rejects non-publishable keys',key=>{
    const result=readRuntimeEnvironment({...liveEnvironment,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key});
    expect(result.isDemo).toBe(false);expect(result.supabasePublishableKey).toBeNull();expect(result.configurationIssue).not.toBeNull();
  });
  it('blocks malformed configuration instead of showing demo profiles',()=>{
    const result=readRuntimeEnvironment({EXPO_PUBLIC_APP_ENV:'prod',EXPO_PUBLIC_DEV_BYPASS_AUTH:'true'});
    expect(result.configurationIssue).not.toBeNull();expect(result.isDemo).toBe(false);
  });
  it('normalizes release mode before evaluating bypass',()=>{
    const result=readRuntimeEnvironment({...liveEnvironment,EXPO_PUBLIC_APP_ENV:' PRODUCTION ',EXPO_PUBLIC_DEV_BYPASS_AUTH:'true'});
    expect(result.bypassAuth).toBe(false);expect(result.isDemo).toBe(false);
  });
});
