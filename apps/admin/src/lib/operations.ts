import { timingSafeEqual } from 'node:crypto';

type Environment = Record<string, string | undefined>;
type HealthResult = {
  status: number;
  body:
    | { error: string }
    | { status: 'ok'; appEnvironment: 'staging' | 'production'; supabaseProjectRef: string };
};

// Read-only deployment identity. Worker clients must verify it before invoking a job.
export function operationsHealth(
  environment: Environment,
  authorization: string | null,
): HealthResult {
  const secret = environment.CRON_SECRET;
  if (!secret || secret.length < 32)
    return { status: 503, body: { error: 'operations_unavailable' } };
  const supplied = Buffer.from(authorization ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return { status: 401, body: { error: 'unauthorized' } };
  const appEnvironment = environment.HITTUMST_APP_ENV;
  if (appEnvironment !== 'staging' && appEnvironment !== 'production')
    return { status: 503, body: { error: 'operations_unavailable' } };
  try {
    const url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error();
    const ref = url.hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
    if (!ref || (appEnvironment === 'staging' && ref === 'yztxwdhajgoqvtsqmcdw')) throw new Error();
    return { status: 200, body: { status: 'ok', appEnvironment, supabaseProjectRef: ref } };
  } catch {
    return { status: 503, body: { error: 'operations_unavailable' } };
  }
}
