export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeDiagnostics } = await import('./lib/diagnostics');
    initializeDiagnostics();
  }
}
// Intentionally omit the request, error and context arguments: none may enter telemetry.
export async function onRequestError() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { captureDiagnostic } = await import('./lib/diagnostics');
    captureDiagnostic('server_request_failed');
  }
}
