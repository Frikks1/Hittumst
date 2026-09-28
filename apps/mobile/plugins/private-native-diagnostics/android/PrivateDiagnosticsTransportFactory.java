package is.rummal.diagnostics;

import io.sentry.Hint;
import io.sentry.ISerializer;
import io.sentry.ITransportFactory;
import io.sentry.RequestDetails;
import io.sentry.SentryEnvelope;
import io.sentry.SentryEnvelopeItem;
import io.sentry.SentryEvent;
import io.sentry.SentryItemType;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.hints.Retryable;
import io.sentry.hints.SubmissionResult;
import io.sentry.protocol.Mechanism;
import io.sentry.protocol.SentryException;
import io.sentry.transport.ITransport;
import io.sentry.transport.RateLimiter;
import io.sentry.util.HintUtils;
import java.util.Collections;

/** Last SDK egress boundary, including envelopes replayed without beforeSend. */
public final class PrivateDiagnosticsTransportFactory implements ITransportFactory {
  static final String LOCAL_EPOCH = "private_local_capture_epoch";
  private final PrivateDiagnosticsQueue queue;
  public PrivateDiagnosticsTransportFactory(PrivateDiagnosticsQueue queue) { this.queue = queue; }

  static String code(SentryEvent event) {
    if (event == null || event.getExceptions() == null || event.getExceptions().isEmpty()) return null;
    String projected = event.getTag("diagnostic_code");
    if (PrivateDiagnosticsPolicy.allowedCode(projected)) return projected;
    for (SentryException exception : event.getExceptions()) {
      if (exception == null) continue;
      if ("OutOfMemoryError".equals(exception.getType()) || "java.lang.OutOfMemoryError".equals(exception.getType()))
        return "android_memory_error";
      if ("ApplicationNotResponding".equals(exception.getType()) || "io.sentry.android.core.ApplicationNotResponding".equals(exception.getType()))
        return "android_anr";
    }
    return "android_uncaught_exception";
  }

    /** First SDK event processor stamps a process-local lease generation, never a user identifier. */
  static SentryEvent markCapture(SentryEvent event, PrivateDiagnosticsQueue queue) {
    String epoch = queue.captureEpoch();
    if (event == null || epoch == null) return null;
    String previous = event.getTag(LOCAL_EPOCH);
    if (previous != null && !previous.equals(epoch)) return null;
    event.setTag(LOCAL_EPOCH, epoch);
    return event;
  }

  static SentryEvent projection(SentryEvent original, PrivateDiagnosticsPolicy policy) {
    String code = code(original);
    if (!policy.enabled || code == null || original.getTag(LOCAL_EPOCH) == null) return null;
    SentryEvent clean = new SentryEvent();
    clean.setPlatform("native"); clean.setLevel(SentryLevel.ERROR);
    clean.setRelease(policy.release); clean.setEnvironment(policy.environment);
    clean.setTag("diagnostic_code", code);
    clean.setTag(LOCAL_EPOCH, original.getTag(LOCAL_EPOCH));
    SentryException exception = new SentryException();
    exception.setType("NativeError"); exception.setValue("Native failure (details withheld)");
    Mechanism mechanism = new Mechanism(); mechanism.setType("generic"); mechanism.setHandled(false);
    exception.setMechanism(mechanism); clean.setExceptions(Collections.singletonList(exception));
    return clean;
  }

  @Override public ITransport create(SentryOptions options, RequestDetails details) {
    final boolean allowed = queue.policy.enabled && details != null && details.getUrl() != null
        && queue.policy.endpoint.equals(details.getUrl().toExternalForm());
    final ISerializer serializer = options.getSerializer();
    return new ITransport() {
      @Override public void send(SentryEnvelope envelope, Hint hint) {
        try {
          if (allowed && envelope != null) {
            for (SentryEnvelopeItem item : envelope.getItems()) {
              // Attachments/minidumps, sessions, profiles, replay, logs, metrics and unknown items never leave.
              if (item == null || item.getHeader().getType() != SentryItemType.Event) continue;
              if (item.getData().length > 262_144) break;
              SentryEvent event = item.getEvent(serializer);
              String code = code(event);
              if (code != null) queue.offer(code, event.getTag(LOCAL_EPOCH));
              break; // One projected error at most; never forward the original envelope or hint.
            }
          }
        } catch (Exception ignored) { /* Invalid input is dropped. There is no unsanitized fallback. */ }
        finally {
          // Prevent an SDK cache/retry path from retaining or resubmitting the original report.
          if (hint != null) {
            HintUtils.runIfHasType(hint, SubmissionResult.class, result -> result.setResult(true));
            HintUtils.runIfHasType(hint, Retryable.class, result -> result.setRetry(false));
          }
        }
      }
      @Override public void flush(long timeoutMillis) { queue.flush(timeoutMillis); }
      @Override public RateLimiter getRateLimiter() { return null; }
      @Override public void close() { queue.close(); }
      @Override public void close(boolean isRestarting) { queue.close(); }
    };
  }
}


