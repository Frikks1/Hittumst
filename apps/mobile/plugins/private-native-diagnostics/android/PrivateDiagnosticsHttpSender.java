package is.rummal.diagnostics;

import java.io.IOException;
import java.net.Proxy;
import java.util.concurrent.TimeUnit;
import okhttp3.Authenticator;
import okhttp3.Call;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** A separate client cannot inherit app cookies, interceptors, credentials or device User-Agent. */
public final class PrivateDiagnosticsHttpSender implements PrivateDiagnosticsQueue.Sender {
  private final OkHttpClient client = new OkHttpClient.Builder()
      .cookieJar(CookieJar.NO_COOKIES).proxy(Proxy.NO_PROXY)
      .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
      .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
      .connectTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
      .writeTimeout(5, TimeUnit.SECONDS).callTimeout(8, TimeUnit.SECONDS).build();

  static Request request(PrivateDiagnosticsPolicy policy, byte[] envelope) {
    return new Request.Builder().url(policy.endpoint)
        .header("User-Agent", "HittumstPrivateDiagnostics/1")
        .header("X-Sentry-Auth", policy.authHeader)
        .header("Accept", "application/json")
        .header("Cache-Control", "no-store")
        .post(RequestBody.create(envelope, MediaType.get("application/x-sentry-envelope"))).build();
  }

  @Override public PrivateDiagnosticsQueue.Flight prepare(PrivateDiagnosticsPolicy policy, byte[] body, long leaseRemainingMs) {
    final Call call = client.newCall(request(policy, body));
    call.timeout().timeout(Math.max(1, Math.min(8_000L, leaseRemainingMs)), TimeUnit.MILLISECONDS);
    return new PrivateDiagnosticsQueue.Flight() {
      @Override public int execute() throws IOException {
        try (Response response = call.execute()) { return response.code(); }
      }
      @Override public void cancel() { call.cancel(); }
    };
  }
}
