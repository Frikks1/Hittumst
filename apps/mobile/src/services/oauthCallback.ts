/** Share single-use PKCE exchanges across native deep links and browser results. */
export function createOAuthCodeExchange<T>(exchange: (code: string) => Promise<T>) {
  let current: { code: string; promise: Promise<T> } | null = null;
  return {
    complete(code: string): Promise<T> {
      if (!code.trim()) return Promise.reject(new Error('oauth_code_missing'));
      if (current?.code === code) return current.promise;
      const promise = Promise.resolve().then(() => exchange(code));
      current = { code, promise };
      void promise.catch(() => { if (current?.promise === promise) current = null; });
      return promise;
    },
    clear() { current = null; },
  };
}

export function readOAuthCallbackCode(url: string, redirectTo: string): string {
  const callback = new URL(url);
  const expected = new URL(redirectTo);
  if (callback.protocol !== expected.protocol || callback.host !== expected.host ||
      callback.pathname !== expected.pathname || callback.username || callback.password) {
    throw new Error('oauth_redirect_mismatch');
  }
  if (callback.searchParams.has('error') || callback.searchParams.has('error_code')) {
    throw new Error('oauth_provider_error');
  }
  const codes = callback.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0]?.trim()) throw new Error('oauth_code_missing');
  return codes[0];
}
