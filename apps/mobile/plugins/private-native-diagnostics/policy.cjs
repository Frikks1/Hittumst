const MAX_ENVELOPE_BYTES = 1024 * 1024;
const NATIVE_POLICY_VERSION = 1;

function readBuildConfig(env = process.env) {
  const disabled = { enabled: false, dsn: '', release: '', environment: '' };
  if (env.EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED !== 'true' || env.EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED !== 'true') return disabled;
  if (!['staging', 'production'].includes(env.EXPO_PUBLIC_APP_ENV) || env.EXPO_PUBLIC_DEV_BYPASS_AUTH === 'true') return disabled;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(env.EXPO_PUBLIC_RELEASE_ID || '')) return disabled;
  if (!/^https:\/\/[a-f0-9]{32}@[a-z0-9-]+[.]ingest[.]de[.]sentry[.]io\/[0-9]+$/.test(env.EXPO_PUBLIC_SENTRY_DSN || '')) return disabled;
  try {
    const dsn = new URL(env.EXPO_PUBLIC_SENTRY_DSN);
    if (dsn.protocol !== 'https:' || !/^[a-z0-9-]+[.]ingest[.]de[.]sentry[.]io$/.test(dsn.hostname) ||
      dsn.port || !/^[a-f0-9]{32}$/.test(dsn.username) || dsn.password || !/^\/[0-9]+$/.test(dsn.pathname) || dsn.search || dsn.hash) return disabled;
    return { enabled: true, dsn: dsn.href, release: env.EXPO_PUBLIC_RELEASE_ID, environment: env.EXPO_PUBLIC_APP_ENV };
  } catch { return disabled; }
}
module.exports = { readBuildConfig, MAX_ENVELOPE_BYTES, NATIVE_POLICY_VERSION };
