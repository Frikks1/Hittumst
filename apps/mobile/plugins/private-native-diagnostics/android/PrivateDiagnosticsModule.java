package is.rummal.diagnostics;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.util.HashMap;
import java.util.Map;

public final class PrivateDiagnosticsModule extends ReactContextBaseJavaModule {
  PrivateDiagnosticsModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "PrivateNativeDiagnostics"; }
  @Override public Map<String, Object> getConstants() {
    Map<String, Object> values = new HashMap<>();
    values.put("configured", PrivateDiagnosticsBootstrap.isConfigured());
    values.put("dsn", PrivateDiagnosticsConfig.DSN); values.put("release", PrivateDiagnosticsConfig.RELEASE);
    values.put("environment", PrivateDiagnosticsConfig.ENVIRONMENT);
    return values;
  }
  @ReactMethod public void setSession(String key, double expiresAtMs, Promise promise) {
    if (!Double.isFinite(expiresAtMs) || expiresAtMs > Long.MAX_VALUE || expiresAtMs < 0 || expiresAtMs != Math.rint(expiresAtMs)) {
      PrivateDiagnosticsBootstrap.setSession(null, 0); promise.reject("diagnostics_invalid_lease", "Invalid diagnostics lease"); return;
    }
    PrivateDiagnosticsBootstrap.setSession(key, (long) expiresAtMs); promise.resolve(null);
  }
  @Override public void invalidate() {
    PrivateDiagnosticsBootstrap.setSession(null, 0);
    super.invalidate();
  }
}
