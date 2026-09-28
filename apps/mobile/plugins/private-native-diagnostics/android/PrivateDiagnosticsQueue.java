package is.rummal.diagnostics;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.UUID;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Stores projected codes only. Every transmission requires a fresh, same-session native lease. */
public final class PrivateDiagnosticsQueue {
  public interface Clock { long wallMillis(); long monotonicNanos(); }
  public interface Flight { int execute() throws IOException; void cancel(); }
  public interface Sender { Flight prepare(PrivateDiagnosticsPolicy policy, byte[] body, long leaseRemainingMs); }
  private static final int MAX_EVENTS = 16;
  private static final long MAX_AGE_MS = 86_400_000L;
  private static final int MAGIC = 0x504e4431;
  private final Object lock = new Object();
  final PrivateDiagnosticsPolicy policy;
  private final File cache;
  private final File temporary;
  private final Sender sender;
  private final Clock clock;
  private final ScheduledThreadPoolExecutor executor;
  private final ArrayDeque<Pending> pending = new ArrayDeque<>();
  private String sessionKey;
  private String captureEpoch;
  private boolean verified;
  private boolean closed;
  private boolean scheduled;
  private long deadlineNanos;
  private long generation;
  private Flight active;
  private ScheduledFuture<?> expiry;
  private ScheduledFuture<?> pump;
  private static final class Pending {
    final String id, code; final long created;
    Pending(String id, String code, long created) { this.id = id; this.code = code; this.created = created; }
  }

  public PrivateDiagnosticsQueue(File directory, PrivateDiagnosticsPolicy policy, Sender sender) {
    this(directory, policy, sender, new Clock() {
      public long wallMillis() { return System.currentTimeMillis(); }
      public long monotonicNanos() { return System.nanoTime(); }
    });
  }
  PrivateDiagnosticsQueue(File directory, PrivateDiagnosticsPolicy policy, Sender sender, Clock clock) {
    this.policy = policy; this.sender = sender; this.clock = clock;
    this.cache = new File(directory, "projected.bin"); this.temporary = new File(directory, "projected.tmp");
    this.executor = new ScheduledThreadPoolExecutor(2, task -> {
      Thread thread = new Thread(task, "private-native-diagnostics"); thread.setDaemon(true); return thread;
    });
    this.executor.setRemoveOnCancelPolicy(true);
    synchronized (lock) { if (policy.enabled) restore(); else clearLocked(); }
  }

  public void setSession(String key, long expiresAtMs) {
    synchronized (lock) {
      long remaining = expiresAtMs - clock.wallMillis();
      if (closed || !policy.enabled || !PrivateDiagnosticsPolicy.validSession(key)
          || remaining <= 0 || remaining > PrivateDiagnosticsPolicy.MAX_LEASE_MS) { clearLocked(); return; }
      if (!key.equals(sessionKey)) { clearLocked(); sessionKey = key; }
      if (captureEpoch == null) captureEpoch = UUID.randomUUID().toString();
      verified = true;
      deadlineNanos = clock.monotonicNanos() + TimeUnit.MILLISECONDS.toNanos(remaining);
      if (expiry != null) expiry.cancel(false);
      final long leaseDeadline = deadlineNanos;
      expiry = executor.schedule(() -> {
        synchronized (lock) { if (deadlineNanos == leaseDeadline) clearLocked(); }
      }, remaining, TimeUnit.MILLISECONDS);
      persistLocked(); scheduleLocked(0);
    }
  }

  String captureEpoch() {
    synchronized (lock) { return isAllowedLocked() ? captureEpoch : null; }
  }
  boolean offer(String code, String expectedEpoch) {
    synchronized (lock) {
      if (!isAllowedLocked() || expectedEpoch == null || !expectedEpoch.equals(captureEpoch)
          || !PrivateDiagnosticsPolicy.allowedCode(code)) return false;
      if (pending.size() == MAX_EVENTS) pending.removeFirst();
      pending.addLast(new Pending(UUID.randomUUID().toString().replace("-", ""), code, clock.wallMillis()));
      persistLocked(); scheduleLocked(0); return true;
    }
  }
  private boolean isAllowedLocked() {
    if (verified && clock.monotonicNanos() >= deadlineNanos) clearLocked();
    return policy.enabled && !closed && verified && PrivateDiagnosticsPolicy.validSession(sessionKey);
  }
  private void scheduleLocked(long delayMs) {
    if (scheduled || active != null || pending.isEmpty() || !isAllowedLocked()) return;
    scheduled = true;
    pump = executor.schedule(this::drainOne, delayMs, TimeUnit.MILLISECONDS);
  }
  private void drainOne() {
    Pending next; Flight flight; long epoch;
    synchronized (lock) {
      scheduled = false;
      if (!isAllowedLocked()) return;
      while (!pending.isEmpty() && !fresh(pending.peekFirst())) pending.removeFirst();
      next = pending.peekFirst(); if (next == null) { persistLocked(); return; }
      byte[] payload = policy.envelope(next.id, next.code);
      if (payload == null) { clearLocked(); return; }
      epoch = generation;
      long remaining = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - clock.monotonicNanos());
      try { flight = sender.prepare(policy, payload, Math.max(1, remaining)); }
      catch (RuntimeException ignored) { scheduleLocked(30_000); return; }
      active = flight;
    }
    int status = 0;
    try { status = flight.execute(); } catch (IOException | RuntimeException ignored) { /* projected retry only */ }
    synchronized (lock) {
      if (active == flight) active = null;
      if (epoch != generation || !isAllowedLocked()) return;
      boolean accepted = status >= 200 && status < 300;
      boolean permanent = status >= 300 && status < 500 && status != 408 && status != 429;
      if (accepted || permanent) pending.remove(next);
      persistLocked(); scheduleLocked(accepted || permanent ? 0 : 30_000);
    }
  }
  private boolean fresh(Pending value) {
    long age = clock.wallMillis() - value.created;
    return age >= -60_000 && age <= MAX_AGE_MS;
  }
  private void clearLocked() {
    generation++; verified = false; deadlineNanos = 0; sessionKey = null; captureEpoch = null; pending.clear();
    if (pump != null) { pump.cancel(false); pump = null; } scheduled = false;
    if (expiry != null) { expiry.cancel(false); expiry = null; }
    if (active != null) { active.cancel(); active = null; }
    deleteFiles();
  }
  private void deleteFiles() {
    // Fixed app-private basenames only; never recursively delete a caller-supplied path.
    if (cache.exists()) cache.delete();
    if (temporary.exists()) temporary.delete();
  }
  private void restore() {
    verified = false;
    if (!cache.isFile()) return;
    if (cache.length() > 8192) { clearLocked(); return; }
    try (DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(cache)))) {
      if (input.readInt() != MAGIC || !policy.fingerprint.equals(input.readUTF())) throw new IOException();
      String key = input.readUTF(); int count = input.readInt();
      if (!PrivateDiagnosticsPolicy.validSession(key) || count < 0 || count > MAX_EVENTS) throw new IOException();
      for (int i = 0; i < count; i++) {
        Pending item = new Pending(input.readUTF(), input.readUTF(), input.readLong());
        if (!item.id.matches("[a-f0-9]{32}") || !PrivateDiagnosticsPolicy.allowedCode(item.code)) throw new IOException();
        if (fresh(item)) pending.add(item);
      }
      if (input.read() != -1) throw new IOException();
      sessionKey = key;
    } catch (IOException | RuntimeException ignored) { clearLocked(); }
  }
  private void persistLocked() {
    if (!policy.enabled || sessionKey == null) { deleteFiles(); return; }
    try {
      File directory = cache.getParentFile();
      if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException();
      try (FileOutputStream stream = new FileOutputStream(temporary);
           DataOutputStream output = new DataOutputStream(new BufferedOutputStream(stream))) {
        output.writeInt(MAGIC); output.writeUTF(policy.fingerprint); output.writeUTF(sessionKey); output.writeInt(pending.size());
        for (Pending item : pending) { output.writeUTF(item.id); output.writeUTF(item.code); output.writeLong(item.created); }
        output.flush(); stream.getFD().sync();
      }
      if (cache.exists() && !cache.delete()) throw new IOException();
      if (!temporary.renameTo(cache)) throw new IOException();
    } catch (IOException | RuntimeException ignored) { deleteFiles(); }
  }
  void flush(long timeoutMillis) {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(Math.min(2000, Math.max(0, timeoutMillis)));
    synchronized (lock) { scheduleLocked(0); }
    while (System.nanoTime() < end) {
      synchronized (lock) { if (pending.isEmpty() || !isAllowedLocked()) return; }
      try { Thread.sleep(10); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return; }
    }
  }
  public void close() {
    synchronized (lock) {
      closed = true; verified = false; generation++;
      if (active != null) { active.cancel(); active = null; }
      if (expiry != null) expiry.cancel(false);
      // Keep only already-projected entries for same-session revalidation on a future start.
    }
    executor.shutdownNow();
  }
}


