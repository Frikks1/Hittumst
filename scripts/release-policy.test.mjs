import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectRelease } from './release-policy.mjs';
const env = {
  EXPO_PUBLIC_APP_ENV: 'production',
  EXPO_PUBLIC_DEV_BYPASS_AUTH: 'false',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.test',
  EXPO_PUBLIC_WEBSITE_URL: 'https://example.test',
};
const app = { ios: { bundleIdentifier: 'is.example.app' }, android: { package: 'is.example.app' } };
test('production configuration accepts only an explicit live backend', () => {
  assert.deepEqual(inspectRelease(env, app), []);
  assert.ok(inspectRelease({}, app).length >= 3);
});
test('bypass and secret keys block a production build', () => {
  assert.ok(
    inspectRelease(
      {
        ...env,
        EXPO_PUBLIC_DEV_BYPASS_AUTH: 'true',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example',
      },
      app,
    ).length >= 2,
  );
});
test('missing operational evidence and branded assets block launch', () => {
  const issues = inspectRelease(env, app, {});
  assert.ok(issues.some((issue) => issue.includes('Hittingar')));
  for (const gate of ['capacity', 'media', 'accountLifecycle', 'operations'])
    assert.ok(issues.some((issue) => issue.includes(gate)));
});
test('a claimed pass without evidence does not open the gate', () => {
  assert.ok(
    inspectRelease(env, app, { backend: { status: 'verified' } }).some((issue) =>
      issue.includes('backend'),
    ),
  );
});
test('sandbox commerce settings block production builds', () => {
  assert.ok(
    inspectRelease({ ...env, EXPO_PUBLIC_REVENUECAT_SANDBOX_KEY: 'test_fixture' }, app).some(
      (issue) => issue.includes('Sandbox commerce'),
    ),
  );
});

test('a staging build cannot use the known production project', () => {
  assert.ok(
    inspectRelease(
      {
        ...env,
        EXPO_PUBLIC_APP_ENV: 'staging',
        EXPO_PUBLIC_SUPABASE_URL: 'https://yztxwdhajgoqvtsqmcdw.supabase.co',
      },
      app,
    ).some((issue) => issue.includes('production project')),
  );
});
