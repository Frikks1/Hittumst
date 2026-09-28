package is.rummal.diagnostics;

import android.app.Application;
import io.sentry.NoOpLogger;
import io.sentry.EventProcessor;
import io.sentry.SentryEvent;
import io.sentry.Hint;
import io.sentry.Sentry;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.android.core.SentryAndroidOptions;
import io.sentry.transport.NoOpEnvelopeCache;
import java.io.File;
import java.util.Collections;

/** Called before React Native; JS cannot replace this SDK's privacy transport. */
public final class PrivateDiagnosticsBootstrap {
  private static PrivateDiagnosticsQueue queue;
  private static boolean configured;
  private PrivateDiagnosticsBootstrap() {}

  public static synchronized void start(Application application) {
    if (queue != null) return;
    PrivateDiagnosticsPolicy policy = new PrivateDiagnosticsPolicy(PrivateDiagnosticsConfig.ENABLED,
        PrivateDiagnosticsConfig.DSN, PrivateDiagnosticsConfig.RELEASE, PrivateDiagnosticsConfig.ENVIRONMENT);
    queue = new PrivateDiagnosticsQueue(new File(application.getNoBackupFilesDir(), "private-native-diagnostics-v1"),
        policy, new PrivateDiagnosticsHttpSender());
    if (!policy.enabled) return;
    try {
      SentryAndroid.init(application, NoOpLogger.getInstance(), options -> configure(application, options, policy));
      configured = true;
    } catch (RuntimeException | LinkageError ignored) {
      // Leave both collection and transmission closed if SDK initialization cannot enforce the policy.
      queue.setSession(null, 0); queue.close(); configured = false;
      Sentry.close();
    }
  }

  private static void configure(Application app, SentryAndroidOptions options, PrivateDiagnosticsPolicy policy) {
    options.setDsn(PrivateDiagnosticsConfig.DSN);
    options.setRelease(policy.release); options.setEnvironment(policy.environment);
    options.setEnabled(true); options.setEnableExternalConfiguration(false); options.setDebug(false);
    options.setLogger(NoOpLogger.getInstance()); options.setFatalLogger(NoOpLogger.getInstance());
    options.setTransportFactory(new PrivateDiagnosticsTransportFactory(queue));
    options.getEventProcessors().add(0, new EventProcessor() {
      @Override public SentryEvent process(SentryEvent event, Hint hint) {
        return PrivateDiagnosticsTransportFactory.markCapture(event, queue);
      }
    });
    options.setBeforeSend((event, hint) -> PrivateDiagnosticsTransportFactory.projection(event, policy));
    options.setBeforeSendTransaction((event, hint) -> null);
    options.setBeforeSendReplay((event, hint) -> null);
    options.setBeforeSendFeedback((event, hint) -> null);
    options.setBeforeBreadcrumb((breadcrumb, hint) -> null);
    options.setEnvelopeDiskCache(NoOpEnvelopeCache.getInstance()); options.setCacheDirPath(null);
    options.setEnableScopePersistence(false); options.setEnableScopeSync(false);
    options.setSendDefaultPii(false); options.setAttachServerName(false); options.setSendModules(false);
    options.setMaxBreadcrumbs(0); options.setMaxAttachmentSize(0); options.setAttachThreads(false);
    options.setAttachStacktrace(false); options.setAttachScreenshot(false); options.setAttachViewHierarchy(false);
    options.setEnableAutoSessionTracking(false); options.setSendClientReports(false);
    options.setEnableNdk(false); options.setEnableNdkAppHangTracking(false); options.setTombstoneEnabled(false);
    options.setAttachRawTombstone(false); options.setReportHistoricalTombstones(false);
    options.setAnrEnabled(true); options.setReportHistoricalAnrs(false); options.setAttachAnrThreadDump(false);
    options.setEnableAnrFingerprinting(false); options.setAnrProfilingSampleRate(0.0);
    options.setReportHistoricalMemoryLimiterExits(false); options.setMemoryLimiterEnabled(false);
    options.setCollectAdditionalContext(false); options.setCollectExternalStorageContext(false); options.setEnableRootCheck(false);
    options.enableAllAutoBreadcrumbs(false); options.setEnableSystemEventBreadcrumbsExtras(false);
    options.setEnableAutoActivityLifecycleTracing(false); options.setEnableUserInteractionTracing(false);
    options.setEnableUserInteractionBreadcrumbs(false); options.setEnableFramesTracking(false);
    options.setEnableScreenTracking(false); options.setEnableAutoTraceIdGeneration(false);
    options.setEnableStandaloneAppStartTracing(false); options.setEnableAppStartProfiling(false);
    options.setStartProfilerOnAppStart(false); options.setProfileSessionSampleRate(0.0);
    options.setTracesSampleRate(0.0); options.setProfilesSampleRate(0.0);
    options.setTracePropagationTargets(Collections.emptyList()); options.setPropagateTraceparent(false);
    options.getSessionReplay().setSessionSampleRate(0.0); options.getSessionReplay().setOnErrorSampleRate(0.0);
    options.getLogs().setEnabled(false); options.getMetrics().setEnabled(false); options.setEnableSpotlight(false);
    options.getScopeObservers().clear(); options.getOptionsObservers().clear();
    options.getIntegrations().clear();
    options.addIntegration(new UncaughtExceptionHandlerIntegration());
    options.addIntegration(new AnrIntegration(app));
    options.setFlushTimeoutMillis(1500); options.setShutdownTimeoutMillis(1500);
    options.setPrintUncaughtStackTrace(false);
  }

  static synchronized boolean isConfigured() { return configured; }
  static synchronized void setSession(String key, long expiresAtMs) {
    if (queue != null) queue.setSession(configured ? key : null, expiresAtMs);
  }
}

