export type HittingarFeatureConfig = {
  enabled: boolean;
  mapStyleUrl: string | null;
  mapProviderConfigured: boolean;
};

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function readHittingarFeatureConfig(
  source: Readonly<Record<string, string | undefined>> = {
    EXPO_PUBLIC_HITTINGAR_ENABLED: process.env.EXPO_PUBLIC_HITTINGAR_ENABLED,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED: process.env.EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED,
    EXPO_PUBLIC_MAPTILER_STYLE_URL: process.env.EXPO_PUBLIC_MAPTILER_STYLE_URL,
    EXPO_PUBLIC_MAPTILER_KEY: process.env.EXPO_PUBLIC_MAPTILER_KEY,
  },
): HittingarFeatureConfig {
  const flag = source.EXPO_PUBLIC_HITTINGAR_ENABLED;
  const production = source.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() === 'production';
  const productionGatesPassed = isTrue(source.EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED);
  const enabled = isTrue(flag) && (!production || productionGatesPassed);
  const explicitStyle = source.EXPO_PUBLIC_MAPTILER_STYLE_URL?.trim();
  const key = source.EXPO_PUBLIC_MAPTILER_KEY?.trim();
  const mapStyleUrl = explicitStyle || (key
    ? `https://api.maptiler.eu/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
    : null);

  return {
    enabled,
    mapStyleUrl,
    mapProviderConfigured: Boolean(mapStyleUrl),
  };
}

export const hittingarFeature = readHittingarFeatureConfig();

export function isHittingarRoute(segments: readonly string[]): boolean {
  return segments[0] === 'hittingar'
    || (segments[0] === '(tabs)' && segments[1] === 'hittingar');
}
