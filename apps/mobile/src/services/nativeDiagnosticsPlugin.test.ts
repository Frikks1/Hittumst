/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { readBuildConfig } = require('../../plugins/private-native-diagnostics/policy.cjs');
const { modifyAndroidApplication, modifyAppDelegate, javaConfig, swiftConfig } = require('../../plugins/private-native-diagnostics/index.cjs');
const allowed = { EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED: 'true', EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED: 'true', EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_RELEASE_ID: 'r1', EXPO_PUBLIC_SENTRY_DSN: 'https://' + 'a'.repeat(32) + '@o1.ingest.de.sentry.io/1' };
describe('private native diagnostics generation', () => {
  it('requires both privacy approvals and excludes development/demo builds', () => {
    for (const env of [{}, { ...allowed, EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED: 'false' }, { ...allowed, EXPO_PUBLIC_APP_ENV: 'development' }, { ...allowed, EXPO_PUBLIC_DEV_BYPASS_AUTH: 'true' }]) {
      expect(readBuildConfig(env)).toEqual({ enabled: false, dsn: '', release: '', environment: '' });
    }
    expect(readBuildConfig(allowed).enabled).toBe(true);
  });
  it('rejects untrusted destinations, ports, credentials, release injection and noncanonical keys', () => {
    for (const dsn of ['http://'+ 'a'.repeat(32)+'@o1.ingest.de.sentry.io/1', allowed.EXPO_PUBLIC_SENTRY_DSN.replace('.de.', '.'), allowed.EXPO_PUBLIC_SENTRY_DSN + '?secret=member', allowed.EXPO_PUBLIC_SENTRY_DSN.replace('/1', ':443/1'), allowed.EXPO_PUBLIC_SENTRY_DSN.replace('@', ':password@'), allowed.EXPO_PUBLIC_SENTRY_DSN.replace('a'.repeat(32), 'a'.repeat(16)), allowed.EXPO_PUBLIC_SENTRY_DSN.replace('ingest.de.sentry.io','ingest.de.sentry.io.evil.test')]) {
      expect(readBuildConfig({ ...allowed, EXPO_PUBLIC_SENTRY_DSN: dsn }).enabled).toBe(false);
    }
    expect(readBuildConfig({ ...allowed, EXPO_PUBLIC_RELEASE_ID: 'private\nmember' }).enabled).toBe(false);
  });
  it('generates identical gated native constants without passing arbitrary environment fields', () => {
    const config = readBuildConfig({ ...allowed, PRIVATE_TOKEN: 'never-embed' });
    expect(javaConfig(config)).toContain('ENABLED = true'); expect(swiftConfig(config)).toContain('enabled = true');
    expect(javaConfig(config) + swiftConfig(config)).not.toContain('never-embed');
    expect(javaConfig(readBuildConfig({}))).not.toContain('ingest');
  });
  it('registers the Android package and bootstrap once in the supported Kotlin template', () => {
    const source = 'package \x60is\x60.rummal.app\nclass Main { val p = PackageList(this).packages.apply { }\nfun onCreate() { super.onCreate() } }';
    const modified = modifyAndroidApplication(source);
    expect(modified).toContain('import \x60is\x60.rummal.diagnostics.PrivateDiagnosticsBootstrap');
    expect(modified).toContain('add(PrivateDiagnosticsPackage())'); expect(modified).toContain('PrivateDiagnosticsBootstrap.start(this)');
    expect(modifyAndroidApplication(modified)).toBe(modified); expect(() => modifyAndroidApplication('unknown template')).toThrow();
  });
  it('registers iOS startup once and refuses an unsupported lifecycle template', () => {
    const source = 'func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [String: Any]?) -> Bool { return true }';
    const modified = modifyAppDelegate(source); expect(modified).toContain('PrivateDiagnosticsBootstrap.start()');
    expect(modifyAppDelegate(modified)).toBe(modified); expect(() => modifyAppDelegate('unknown template')).toThrow();
  });
});
