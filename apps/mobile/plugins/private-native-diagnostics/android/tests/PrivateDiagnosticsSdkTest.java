package is.rummal.diagnostics;

import io.sentry.Hint;
import io.sentry.RequestDetails;
import io.sentry.SentryEnvelope;
import io.sentry.SentryEnvelopeItem;
import io.sentry.SentryEvent;
import io.sentry.SentryOptions;
import io.sentry.transport.ITransport;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import okhttp3.Request;

/** Exercises the real public Sentry8.57.0 envelope API. All senders are fake: zero network. */
public final class PrivateDiagnosticsSdkTest {
  static final String SENTINEL = "DO_NOT_SEND_EMAIL_TOKEN_LOCATION_PROFILE";
  static final SentryOptions OPTIONS = new SentryOptions();
  static { OPTIONS.setSerializer(new io.sentry.JsonSerializer(OPTIONS)); }
  static int assertions;
  static void check(boolean value, String label) { assertions++; if (!value) throw new AssertionError(label); }
  static SentryEvent poisoned() {
    String json = "{\"event_id\":\"ffffffffffffffffffffffffffffffff\",\"platform\":\"java\",\"message\":{\"formatted\":\"" + SENTINEL
        + "\"},\"user\":{\"id\":\"" + SENTINEL + "\",\"email\":\"" + SENTINEL + "\"},\"request\":{\"url\":\"https://private.example/" + SENTINEL
        + "\"},\"contexts\":{\"device\":{\"name\":\"" + SENTINEL + "\"}},\"breadcrumbs\":[{\"message\":\"" + SENTINEL
        + "\"}],\"extra\":{\"secret\":\"" + SENTINEL + "\"},\"exception\":{\"values\":[{\"type\":\"OutOfMemoryError\",\"value\":\"" + SENTINEL
        + "\",\"stacktrace\":{\"frames\":[{\"filename\":\"" + SENTINEL + "\"}]}}]}}";
    return OPTIONS.getSerializer().deserialize(new StringReader(json), SentryEvent.class);
  }
  static SentryEnvelope envelope(SentryEvent event) throws Exception {
    return new SentryEnvelope(event.getEventId(), null, SentryEnvelopeItem.fromEvent(OPTIONS.getSerializer(), event));
  }
  static SentryEnvelope raw(String type, String body) {
    byte[] payload = ("{\"event_id\":\"ffffffffffffffffffffffffffffffff\",\"sdk\":{\"name\":\"" + SENTINEL
        + "\",\"version\":\"1\"}}\n{\"type\":\"" + type + "\",\"length\":" + body.getBytes(StandardCharsets.UTF_8).length
        + "}\n" + body + "\n").getBytes(StandardCharsets.UTF_8);
    return OPTIONS.getSerializer().deserializeEnvelope(new ByteArrayInputStream(payload));
  }
  static ITransport transport(PrivateDiagnosticsQueue queue, String url) {
    return new PrivateDiagnosticsTransportFactory(queue).create(OPTIONS, new RequestDetails(url, Collections.singletonMap("Authorization", SENTINEL)));
  }
  public static void main(String[] args) throws Exception {
    testFinalBoundary(); testDelayedEnvelope(); testEndpointsAndHeaders();
    System.out.println("Private native diagnostics SDK: " + assertions + " assertions passed (Sentry8.57.0, offline)");
  }
  static void testFinalBoundary() throws Exception {
    File dir = PrivateDiagnosticsCoreTest.directory(); PrivateDiagnosticsCoreTest.TestClock clock = new PrivateDiagnosticsCoreTest.TestClock();
    PrivateDiagnosticsCoreTest.TestSender sender = new PrivateDiagnosticsCoreTest.TestSender();
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, PrivateDiagnosticsCoreTest.policy(), sender, clock);
    ITransport transport = transport(queue, queue.policy.endpoint);
    try {
      queue.setSession(PrivateDiagnosticsCoreTest.A, clock.wallMillis() + 60_000);
      transport.send(envelope(poisoned()), new Hint());
      check(sender.count() == 0, "unprovenanced raw/replayed SDK envelope dropped");
      check(PrivateDiagnosticsTransportFactory.projection(poisoned(), queue.policy) == null, "beforeSend rejects absent capture marker");
      for (String type : new String[]{"attachment", "transaction", "session", "sessions", "profile", "profile_chunk", "replay_event", "replay_recording", "check_in", "feedback", "log", "trace_metric", "client_report", "unknown"}) {
        transport.send(raw(type, SENTINEL), new Hint());
        check(sender.count() == 0, "non-event envelope type dropped: " + type);
      }
      transport.send(raw("event", "not-json"), new Hint());
      transport.send(raw("event", "x".repeat(262_145)), new Hint());
      check(sender.count() == 0, "malformed and oversized event dropped");
      SentryEvent captured = PrivateDiagnosticsTransportFactory.markCapture(poisoned(), queue);
      SentryEvent projected = PrivateDiagnosticsTransportFactory.projection(captured, queue.policy);
      check(projected != null && "android_memory_error".equals(projected.getTag("diagnostic_code")), "finite diagnostic code retained");
      // Simulate a later processor or persisted-envelope path restoring all the sensitive fields.
      SentryEvent rePoisoned = poisoned(); rePoisoned.setTag(PrivateDiagnosticsTransportFactory.LOCAL_EPOCH, projected.getTag(PrivateDiagnosticsTransportFactory.LOCAL_EPOCH));
      transport.send(envelope(rePoisoned), new Hint());
      PrivateDiagnosticsCoreTest.eventually(() -> sender.count() == 1, "final SDK transport emitted one projection");
      String outgoing = sender.payloads.get(0);
      for (String forbidden : new String[]{SENTINEL, "ffffffffffffffffffffffffffffffff", "request", "user", "contexts", "breadcrumbs", "stacktrace", "extra", "sdk", PrivateDiagnosticsTransportFactory.LOCAL_EPOCH, PrivateDiagnosticsCoreTest.A})
        check(!outgoing.contains(forbidden), "egress omits " + forbidden);
      check(outgoing.contains("android_memory_error") && outgoing.contains("NativeError"), "egress keeps static diagnostic meaning");
    } finally { transport.close(); PrivateDiagnosticsCoreTest.clean(dir); }
  }
  static void testDelayedEnvelope() throws Exception {
    File dir = PrivateDiagnosticsCoreTest.directory(); PrivateDiagnosticsCoreTest.TestClock clock = new PrivateDiagnosticsCoreTest.TestClock();
    PrivateDiagnosticsCoreTest.TestSender sender = new PrivateDiagnosticsCoreTest.TestSender();
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, PrivateDiagnosticsCoreTest.policy(), sender, clock);
    ITransport transport = transport(queue, queue.policy.endpoint);
    try {
      queue.setSession(PrivateDiagnosticsCoreTest.A, clock.wallMillis() + 60_000);
      SentryEvent old = PrivateDiagnosticsTransportFactory.projection(PrivateDiagnosticsTransportFactory.markCapture(poisoned(), queue), queue.policy);
      SentryEnvelope delayed = envelope(old);
      queue.setSession(PrivateDiagnosticsCoreTest.B, clock.wallMillis() + 60_000);
      transport.send(delayed, new Hint()); queue.flush(50);
      check(sender.count() == 0, "projectA-switchB-deliverA sends nothing");
      check(PrivateDiagnosticsTransportFactory.markCapture(old, queue) == null, "old capture marker cannot be rebound by processor");
      SentryEvent current = PrivateDiagnosticsTransportFactory.projection(PrivateDiagnosticsTransportFactory.markCapture(poisoned(), queue), queue.policy);
      transport.send(envelope(current), new Hint());
      PrivateDiagnosticsCoreTest.eventually(() -> sender.count() == 1, "current session projection accepted");
      check(sender.count() == 1, "only current report sent");
      queue.setSession(null, 0); transport.send(envelope(current), new Hint());
      check(sender.count() == 1, "logout rejects delayed envelope");
    } finally { transport.close(); PrivateDiagnosticsCoreTest.clean(dir); }
  }
  static void testEndpointsAndHeaders() throws Exception {
    File dir = PrivateDiagnosticsCoreTest.directory(); PrivateDiagnosticsCoreTest.TestClock clock = new PrivateDiagnosticsCoreTest.TestClock();
    PrivateDiagnosticsCoreTest.TestSender sender = new PrivateDiagnosticsCoreTest.TestSender();
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, PrivateDiagnosticsCoreTest.policy(), sender, clock);
    ITransport transport = transport(queue, "https://attacker.example/api/123/envelope/");
    try {
      queue.setSession(PrivateDiagnosticsCoreTest.A, clock.wallMillis() + 60_000);
      SentryEvent projected = PrivateDiagnosticsTransportFactory.projection(PrivateDiagnosticsTransportFactory.markCapture(poisoned(), queue), queue.policy);
      transport.send(envelope(projected), new Hint()); check(sender.count() == 0, "SDK endpoint substitution rejected");
      Request request = PrivateDiagnosticsHttpSender.request(queue.policy, queue.policy.envelope("1".repeat(32), "android_anr"));
      check(request.url().toString().equals(queue.policy.endpoint), "sender destination rebuilt from validated configuration");
      check("HittumstPrivateDiagnostics/1".equals(request.header("User-Agent")), "static user agent avoids device identifiers");
      check(request.header("Cookie") == null && request.header("Authorization") == null, "no inherited identity headers");
      check(request.header("X-Sentry-Auth").equals(queue.policy.authHeader), "only public DSN authentication rebuilt");
      check(!request.headers().toString().contains(SENTINEL), "SDK supplied headers not forwarded");
    } finally { transport.close(); PrivateDiagnosticsCoreTest.clean(dir); }
  }
}