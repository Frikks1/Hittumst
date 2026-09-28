package is.rummal.diagnostics;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Only build-owned configuration and fixed diagnostic codes enter the wire format. */
public final class PrivateDiagnosticsPolicy {
  public static final long MAX_LEASE_MS = 120_000L;
  public static final String VERSION = "private-native-v1";
  private static final Set<String> CODES = new HashSet<>(Arrays.asList(
      "android_uncaught_exception", "android_anr", "android_memory_error"));
  final boolean enabled;
  final String release;
  final String environment;
  final String endpoint;
  final String authHeader;
  final String fingerprint;

  public PrivateDiagnosticsPolicy(boolean requested, String dsn, String release, String environment) {
    String endpointValue = "", authValue = "", fingerprintValue = "";
    boolean valid = false;
    try {
      URI uri = new URI(dsn == null ? "" : dsn);
      String host = uri.getHost(), key = uri.getRawUserInfo();
      valid = requested && ("staging".equals(environment) || "production".equals(environment))
          && release != null && release.matches("[A-Za-z0-9._-]{1,100}")
          && "https".equals(uri.getScheme()) && uri.getPort() == -1
          && host != null && host.matches("[a-z0-9-]+\\.ingest\\.de\\.sentry\\.io")
          && key != null && key.matches("[a-fA-F0-9]{32}")
          && uri.getRawPath().matches("/[0-9]{1,20}")
          && uri.getRawQuery() == null && uri.getRawFragment() == null;
      if (valid) {
        endpointValue = "https://" + host + "/api" + uri.getRawPath() + "/envelope/";
        authValue = "Sentry sentry_version=7, sentry_key=" + key + ", sentry_client=hittumst-private-native/1";
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(
            (VERSION + "\n" + dsn + "\n" + release + "\n" + environment).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte value : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        fingerprintValue = hex.toString();
      }
    } catch (Exception ignored) { valid = false; }
    this.enabled = valid;
    this.release = valid ? release : "disabled";
    this.environment = valid ? environment : "disabled";
    this.endpoint = endpointValue;
    this.authHeader = authValue;
    this.fingerprint = fingerprintValue;
  }

  public static boolean allowedCode(String value) { return CODES.contains(value); }
  static boolean validSession(String value) { return value != null && value.matches("[a-f0-9]{64}"); }

  byte[] envelope(String id, String code) {
    if (!enabled || !id.matches("[a-f0-9]{32}") || !allowedCode(code)) return null;
    // No incoming event JSON, envelope header, timestamp, stack, ID, or request header is reused.
    String event = "{\"event_id\":\"" + id + "\",\"platform\":\"native\",\"level\":\"error\","
        + "\"release\":\"" + release + "\",\"environment\":\"" + environment + "\","
        + "\"tags\":{\"diagnostic_code\":\"" + code + "\"},"
        + "\"exception\":{\"values\":[{\"type\":\"NativeError\",\"value\":\"Native failure (details withheld)\","
        + "\"mechanism\":{\"type\":\"generic\",\"handled\":false}}]}}";
    int length = event.getBytes(StandardCharsets.UTF_8).length;
    return ("{\"event_id\":\"" + id + "\"}\n{\"type\":\"event\",\"length\":" + length + "}\n" + event + "\n")
        .getBytes(StandardCharsets.UTF_8);
  }
}
