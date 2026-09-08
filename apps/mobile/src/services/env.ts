import { z } from 'zod';

export type RuntimeEnvironment = {
  appEnvironment: 'development' | 'staging' | 'production';
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  mapTilerApiKey: string | null;
  supportEmail: string;
  websiteUrl: string | null;
  isDemo: boolean;
  bypassAuth: boolean;
  configurationIssue: string | null;
};

// Expo replaces only direct process.env.EXPO_PUBLIC_* references when bundling.
const bundledEnvironment = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_DEV_BYPASS_AUTH: process.env.EXPO_PUBLIC_DEV_BYPASS_AUTH,
  EXPO_PUBLIC_MAPTILER_KEY: process.env.EXPO_PUBLIC_MAPTILER_KEY,
  EXPO_PUBLIC_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
  EXPO_PUBLIC_WEBSITE_URL: process.env.EXPO_PUBLIC_WEBSITE_URL,
};

export function readRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>> = bundledEnvironment,
): RuntimeEnvironment {
  const rawMode = source.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  const appEnvironment = rawMode === 'production' || rawMode === 'staging' ? rawMode : 'development';
  const url = source.EXPO_PUBLIC_SUPABASE_URL?.trim() || null;
  const key = source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || null;
  const requestedBypass = source.EXPO_PUBLIC_DEV_BYPASS_AUTH?.trim().toLowerCase() === 'true';
  const invalidMode = Boolean(rawMode && !['development', 'staging', 'production'].includes(rawMode));
  const bypassAuth = !invalidMode && appEnvironment === 'development' && requestedBypass;
  const isDemo = !invalidMode && appEnvironment === 'development' && (bypassAuth || (!url && !key && !source.EXPO_PUBLIC_SUPABASE_ANON_KEY));
  let configurationIssue: string | null = null;
  const supportEmail = z.email().safeParse(source.EXPO_PUBLIC_SUPPORT_EMAIL?.trim());
  let websiteUrl: string | null = null;
  try {
    const website = new URL(source.EXPO_PUBLIC_WEBSITE_URL?.trim() ?? '');
    if (website.protocol === 'https:' && !website.username && !website.password && !website.port && website.pathname === '/' && !website.search && !website.hash) websiteUrl = website.origin;
  } catch { /* An absent public site remains unavailable until configured. */ }

  if (invalidMode) configurationIssue = 'Unknown application environment.';
  else if (!isDemo) {
    try {
      const parsed = new URL(url ?? '');
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') ||
          parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
          parsed.pathname !== '/') configurationIssue = 'An HTTPS Supabase project URL is required.';
    } catch {
      configurationIssue = 'An HTTPS Supabase project URL is required.';
    }
    // Legacy JWT keys can be privileged service_role keys. Accept publishable keys only.
    if (!key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      configurationIssue = 'A Supabase publishable key is required.';
    }
  }
  if (!configurationIssue && appEnvironment === 'production' && (!websiteUrl || !supportEmail.success)) configurationIssue = 'Public support contact and website must be configured.';
  return {
    appEnvironment,
    supabaseUrl: isDemo || configurationIssue ? null : url,
    supabasePublishableKey: isDemo || configurationIssue ? null : key,
    mapTilerApiKey: source.EXPO_PUBLIC_MAPTILER_KEY?.trim() || null,
    supportEmail: supportEmail.success ? supportEmail.data : '',
    websiteUrl,
    isDemo,
    bypassAuth,
    configurationIssue,
  };
}
export const runtimeEnv = readRuntimeEnvironment();
