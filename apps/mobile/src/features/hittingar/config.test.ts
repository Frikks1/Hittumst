import { describe, expect, it } from 'vitest';
import { isHittingarRoute, readHittingarFeatureConfig } from './config';

describe('Hittingar feature configuration', () => {
  it('fails closed in every environment unless explicitly enabled', () => {
    expect(readHittingarFeatureConfig({}).enabled).toBe(false);
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_APP_ENV: 'development' }).enabled).toBe(false);
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_APP_ENV: 'production' }).enabled).toBe(false);
  });

  it('requires both the rollout flag and completed gates in production', () => {
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_HITTINGAR_ENABLED: ' true ' }).enabled).toBe(true);
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_HITTINGAR_ENABLED: ' true ' }).enabled).toBe(false);
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_HITTINGAR_ENABLED: 'true', EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED: 'true' }).enabled).toBe(true);
    expect(readHittingarFeatureConfig({ EXPO_PUBLIC_HITTINGAR_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('uses the EU MapTiler endpoint without leaking a missing key', () => {
    const configured = readHittingarFeatureConfig({ EXPO_PUBLIC_MAPTILER_KEY: 'demo key' });
    expect(configured.mapStyleUrl).toBe('https://api.maptiler.eu/maps/streets-v2/style.json?key=demo%20key');
    expect(configured.mapProviderConfigured).toBe(true);
    expect(readHittingarFeatureConfig({}).mapStyleUrl).toBeNull();
  });

  it('recognizes tab and standalone deep links for fail-closed routing', () => {
    expect(isHittingarRoute(['(tabs)', 'hittingar'])).toBe(true);
    expect(isHittingarRoute(['hittingar', 'create'])).toBe(true);
    expect(isHittingarRoute(['hittingar', 'meetup-id', 'manage'])).toBe(true);
    expect(isHittingarRoute(['(tabs)', 'discover'])).toBe(false);
    expect(isHittingarRoute(['profile', 'profile-id'])).toBe(false);
  });
});
