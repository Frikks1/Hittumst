import { launchGates } from './release-evidence.mjs';

export function inspectRelease(environment, app, gates = null) {
  const issues = [];
  const mode = environment.EXPO_PUBLIC_APP_ENV;
  if (!['staging', 'production'].includes(mode))
    issues.push('Build must explicitly use staging or production.');
  if (environment.EXPO_PUBLIC_DEV_BYPASS_AUTH?.trim().toLowerCase() === 'true')
    issues.push('Authentication bypass must be disabled.');
  if (
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')
  )
    issues.push('Configure a publishable Supabase key; secret and legacy JWT keys are rejected.');
  try {
    const url = new URL(environment.EXPO_PUBLIC_SUPABASE_URL);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.supabase.co') ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw Error();
  } catch {
    issues.push('Configure a valid HTTPS Supabase project URL.');
  }
  if (
    mode === 'staging' &&
    environment.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
      'https://yztxwdhajgoqvtsqmcdw.supabase.co'
  )
    issues.push('Staging builds cannot target the production project.');
  if (
    environment.EXPO_PUBLIC_HITTINGAR_ENABLED?.trim().toLowerCase() === 'true' &&
    mode === 'production' &&
    environment.EXPO_PUBLIC_HITTINGAR_PRODUCTION_GATES_PASSED !== 'true'
  )
    issues.push('Keep Hittingar off until its production gates pass.');
  if (!app.ios?.bundleIdentifier || !app.android?.package)
    issues.push('Both native application identifiers are required.');
  if (mode === 'production') {
    if (environment.EXPO_PUBLIC_REVENUECAT_SANDBOX_KEY || environment.COMMERCE_MODE === 'sandbox')
      issues.push('Sandbox commerce configuration cannot be included in a production build.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.EXPO_PUBLIC_SUPPORT_EMAIL ?? ''))
      issues.push('A monitored support email must be configured.');
    try {
      const url = new URL(environment.EXPO_PUBLIC_WEBSITE_URL);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw Error();
    } catch {
      issues.push('A public HTTPS website for support and policies must be configured.');
    }
  }
  if (gates) {
    if (mode !== 'production')
      issues.push(
        'Launch preflight requires the production environment; staging checks cannot approve publication.',
      );
    if (!app.icon || !app.android?.adaptiveIcon?.foregroundImage)
      issues.push('Final branded native icons are missing.');
    if (mode === 'production' && environment.EXPO_PUBLIC_HITTINGAR_ENABLED !== 'true')
      issues.push(
        'This release includes Hittingar; its verified production controls must be enabled.',
      );
    for (const name of launchGates) {
      const gate = gates[name];
      if (gate?.status !== 'verified' || !gate.evidence || !gate.verifiedBy || !gate.verifiedAt)
        issues.push('Launch evidence missing: ' + name + '.');
    }
  }
  return issues;
}
