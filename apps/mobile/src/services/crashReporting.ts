import { initializeNativeDiagnostics } from './nativeDiagnostics';
import * as Sentry from '@sentry/react-native';
import { runtimeEnv } from './env';
import { privateCrashEvent } from './crashPrivacy';

let initialized = false;
export function initializeCrashReporting() {
  initializeNativeDiagnostics();
  if (
    initialized ||
    runtimeEnv.isDemo ||
    runtimeEnv.configurationIssue ||
    process.env.EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED !== 'true' ||
    !process.env.EXPO_PUBLIC_SENTRY_DSN
  )
    return;
  const release = process.env.EXPO_PUBLIC_RELEASE_ID;
  if (!release || !/^[A-Za-z0-9._-]{1,100}$/.test(release)) return;
  try {
    const dsn = new URL(process.env.EXPO_PUBLIC_SENTRY_DSN);
    if (
      dsn.protocol !== 'https:' ||
      !dsn.hostname.endsWith('.ingest.de.sentry.io') ||
      !dsn.username ||
      dsn.password ||
      !/^\/[0-9]+$/.test(dsn.pathname) ||
      dsn.search ||
      dsn.hash
    )
      return;
  } catch {
    return;
  }
  initialized = true;
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    release,
    environment: runtimeEnv.appEnvironment,
    sendDefaultPii: false,
    enableNative: false,
    enableNativeCrashHandling: false,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableAppHangTracking: false,
    enableWatchdogTerminationTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    defaultIntegrations: false,
    integrations: [Sentry.reactNativeErrorHandlersIntegration()],
    beforeSend: (event) => privateCrashEvent(event, release, runtimeEnv.appEnvironment),
    beforeSendTransaction: () => null,
  });
}
