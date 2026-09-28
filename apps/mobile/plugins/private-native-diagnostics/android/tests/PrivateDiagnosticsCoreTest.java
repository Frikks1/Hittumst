package is.rummal.diagnostics;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

/** Offline contract tests. No SDK, emulator, network, test framework or additional dependency. */
public final class PrivateDiagnosticsCoreTest {
  static final String DSN = "https://0123456789abcdef0123456789abcdef@o123.ingest.de.sentry.io/123";
  static final String A = "a".repeat(64), B = "b".repeat(64);
  static int assertions;
  static final class TestClock implements PrivateDiagnosticsQueue.Clock {
    final AtomicLong wall = new AtomicLong(1_800_000_000_000L), mono = new AtomicLong(1_000_000L);
    public long wallMillis() { return wall.get(); }
    public long monotonicNanos() { return mono.get(); }
  }
  static final class TestSender implements PrivateDiagnosticsQueue.Sender {
    final List<String> payloads = new ArrayList<>();
    final CountDownLatch started = new CountDownLatch(1), done = new CountDownLatch(1);
    volatile boolean block, cancelled; volatile int status = 200;
    @Override public PrivateDiagnosticsQueue.Flight prepare(PrivateDiagnosticsPolicy policy, byte[] body, long remaining) {
      check(remaining > 0 && remaining <= 120_000, "request lifetime bounded by session lease");
      return new PrivateDiagnosticsQueue.Flight() {
        public int execute() {
          synchronized (payloads) { payloads.add(new String(body, StandardCharsets.UTF_8)); }
          started.countDown();
          if (block) try { done.await(3, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
          return status;
        }
        public void cancel() { cancelled = true; done.countDown(); }
      };
    }
    int count() { synchronized (payloads) { return payloads.size(); } }
  }
  static synchronized void check(boolean value, String label) {
    assertions++;
    if (!value) throw new AssertionError(label);
  }
  static void eventually(BooleanSupplier condition, String label) throws Exception {
    long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
    while (!condition.getAsBoolean() && System.nanoTime() < end) Thread.sleep(5);
    check(condition.getAsBoolean(), label);
  }
  static PrivateDiagnosticsPolicy policy() { return new PrivateDiagnosticsPolicy(true, DSN, "1.2.3", "staging"); }
  static File directory() throws Exception { return Files.createTempDirectory("native-private-test-").toFile(); }
  static void clean(File directory) throws Exception {
    Files.deleteIfExists(new File(directory, "projected.bin").toPath());
    Files.deleteIfExists(new File(directory, "projected.tmp").toPath());
    Files.delete(directory.toPath());
  }
  public static void main(String[] args) throws Exception {
    testPolicy(); testLeaseAndGeneration(); testCacheRecovery(); testCancelledFlight(); testBoundedCache();
    System.out.println("Private native diagnostics core: " + assertions + " assertions passed (offline)");
  }
  static void testPolicy() {
    check(policy().enabled, "valid dedicated EU configuration");
    for (String dsn : new String[]{DSN.replace("https", "http"), DSN.replace(".de.sentry", ".us.sentry"),
        DSN.replace(".io/", ".io:443/"), DSN + "?x=y", DSN + "#x", DSN.replace("@", ":password@"),
        DSN.replace("o123.ingest.de.sentry.io", "o123.ingest.de.sentry.io.attacker.example"), DSN.replace("/123", "/prefix/123"), ""}) {
      check(!new PrivateDiagnosticsPolicy(true, dsn, "1.2.3", "production").enabled, "reject invalid endpoint");
    }
    for (String env : new String[]{"development", "demo", "Production", "", null})
      check(!new PrivateDiagnosticsPolicy(true, DSN, "1.2.3", env).enabled, "reject unapproved environment");
    check(!new PrivateDiagnosticsPolicy(false, DSN, "1.2.3", "production").enabled, "privacy gate closed");
    check(!new PrivateDiagnosticsPolicy(true, DSN, "private user email@example.org", "production").enabled, "release is build identifier only");
    check(!new PrivateDiagnosticsPolicy(true, DSN, "a".repeat(101), "production").enabled, "release length bounded");
    check(policy().envelope("1".repeat(32), "arbitrary private text") == null, "unknown diagnostic code rejected");
    String wire = new String(policy().envelope("1".repeat(32), "android_anr"), StandardCharsets.UTF_8);
    check(wire.contains("android_anr") && wire.contains("NativeError"), "fixed useful diagnostic survives");
    check(!wire.contains("user") && !wire.contains("request") && !wire.contains("contexts") && !wire.contains("breadcrumbs"), "no identifying event fields");
  }
  static void testLeaseAndGeneration() throws Exception {
    File dir = directory(); TestClock clock = new TestClock(); TestSender sender = new TestSender();
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, policy(), sender, clock);
    try {
      check(queue.captureEpoch() == null && !queue.offer("android_anr", "unknown"), "startup closed");
      queue.setSession(A, clock.wallMillis() + 120_001);
      check(queue.captureEpoch() == null, "overlong lease closed");
      queue.setSession("user-id", clock.wallMillis() + 60_000);
      check(queue.captureEpoch() == null, "raw identity rejected");
      queue.setSession(A, clock.wallMillis() - 1);
      check(queue.captureEpoch() == null, "expired lease closed");
      queue.setSession(A, clock.wallMillis() + 60_000); String epochA = queue.captureEpoch();
      check(epochA != null, "validated session opens lease");
      queue.setSession(A, clock.wallMillis() + 70_000);
      check(epochA.equals(queue.captureEpoch()), "same-session refresh preserves captured events");
      queue.setSession(B, clock.wallMillis() + 60_000);
      check(!epochA.equals(queue.captureEpoch()), "account switch rotates provenance");
      check(!queue.offer("android_anr", epochA), "delayed previous-session event dropped");
      check(!queue.offer("android_anr", null), "unprovenanced cached envelope dropped");
      check(sender.count() == 0, "old-session events never sent");
      String epochB = queue.captureEpoch(); clock.wall.addAndGet(-100_000); clock.mono.addAndGet(TimeUnit.SECONDS.toNanos(61));
      check(!queue.offer("android_anr", epochB), "wall-clock rollback cannot extend monotonic lease");
      check(!new File(dir, "projected.bin").exists(), "expiry purges projected cache");
      queue.setSession(A, clock.wallMillis() + 1000); queue.setSession(null, 0);
      check(queue.captureEpoch() == null, "logout closes gate");
    } finally { queue.close(); clean(dir); }
  }
  static void testCacheRecovery() throws Exception {
    File dir = directory(); TestClock clock = new TestClock(); TestSender failed = new TestSender(); failed.status = 503;
    PrivateDiagnosticsQueue first = new PrivateDiagnosticsQueue(dir, policy(), failed, clock);
    first.setSession(A, clock.wallMillis() + 60_000);
    String epoch = first.captureEpoch(); check(first.offer("android_memory_error", epoch), "accept projected code");
    eventually(() -> failed.count() == 1, "first projected attempt"); first.close();
    byte[] cache = Files.readAllBytes(new File(dir, "projected.bin").toPath());
    String local = new String(cache, StandardCharsets.ISO_8859_1);
    check(local.contains("android_memory_error") && local.contains(A), "cache binds projected code to local session hash");
    check(!local.contains(epoch) && !local.contains("exception") && !local.contains("request"), "no raw event or process provenance persisted");
    TestSender recovered = new TestSender(); PrivateDiagnosticsQueue second = new PrivateDiagnosticsQueue(dir, policy(), recovered, clock);
    check(second.captureEpoch() == null && recovered.count() == 0, "recovered cache cannot send before validation");
    second.setSession(A, clock.wallMillis() + 60_000);
    eventually(() -> recovered.count() == 1, "same verified session recovers projected count"); second.close();
    TestSender failedAgain = new TestSender(); failedAgain.status = 503;
    PrivateDiagnosticsQueue third = new PrivateDiagnosticsQueue(dir, policy(), failedAgain, clock);
    third.setSession(A, clock.wallMillis() + 60_000); third.offer("android_anr", third.captureEpoch());
    eventually(() -> failedAgain.count() == 1, "persist another projected count"); third.close();
    TestSender changed = new TestSender(); PrivateDiagnosticsQueue fourth = new PrivateDiagnosticsQueue(dir, policy(), changed, clock);
    fourth.setSession(B, clock.wallMillis() + 60_000); fourth.flush(50);
    check(changed.count() == 0, "changed account discards recovered count"); fourth.close();
    Files.write(new File(dir, "projected.bin").toPath(), "raw private legacy SDK envelope".getBytes(StandardCharsets.UTF_8));
    PrivateDiagnosticsQueue corrupt = new PrivateDiagnosticsQueue(dir, policy(), changed, clock);
    check(!new File(dir, "projected.bin").exists(), "unknown cache version purged without upload"); corrupt.close(); clean(dir);
  }
  static void testCancelledFlight() throws Exception {
    File dir = directory(); TestClock clock = new TestClock(); TestSender sender = new TestSender(); sender.block = true;
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, policy(), sender, clock);
    try {
      queue.setSession(A, clock.wallMillis() + 60_000); String epoch = queue.captureEpoch();
      queue.offer("android_anr", epoch); check(sender.started.await(3, TimeUnit.SECONDS), "projected request started");
      queue.offer("android_anr", epoch); queue.setSession(null, 0);
      check(sender.cancelled, "logout cancels in-flight request");
      queue.flush(50); check(sender.count() == 1, "logout discards queued second request");
      check(!new File(dir, "projected.bin").exists(), "logout deletes cache");
    } finally { queue.close(); clean(dir); }
  }
  static void testBoundedCache() throws Exception {
    File dir = directory(); TestClock clock = new TestClock(); TestSender sender = new TestSender(); sender.block = true;
    PrivateDiagnosticsQueue queue = new PrivateDiagnosticsQueue(dir, policy(), sender, clock);
    try {
      queue.setSession(A, clock.wallMillis() + 60_000);
      for (int i = 0; i < 30; i++) queue.offer("android_anr", queue.captureEpoch());
      check(new File(dir, "projected.bin").length() <= 8192, "projected cache bounded");
      try (java.io.DataInputStream input = new java.io.DataInputStream(new java.io.FileInputStream(new File(dir, "projected.bin")))) {
        input.readInt(); input.readUTF(); input.readUTF(); check(input.readInt() <= 16, "at most sixteen projected reports");
      }
      queue.setSession(null, 0);
    } finally { queue.close(); clean(dir); }
  }
}