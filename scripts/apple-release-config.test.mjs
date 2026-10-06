// Guards the Apple App Store release configuration.
//
// These checks protect configuration that Apple requires at submission time and that
// is easy to lose in an unrelated edit: the preserved identifiers, the iOS privacy
// manifest (required-reason APIs) and the App Store build/submission profiles.
// Passing here means the repository is configured for an App Store build; it is not
// evidence that a build, TestFlight round or review happened. See
// docs/apple-launch-track.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const app = readJson('apps/mobile/app.json').expo;
const eas = readJson('apps/mobile/eas.json');
const submission = readJson('docs/store-submission.json');

// Apple's required-reason categories and the reason in use. Update together with the
// generated PrivacyInfo.xcprivacy when a native dependency changes.
const REQUIRED_REASONS = {
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
  NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1'],
};

const resolveProfile = (name, seen = []) => {
  const profile = eas.build?.[name];
  if (!profile) return null;
  if (!profile.extends) return profile;
  assert.ok(!seen.includes(name), `Build profile ${name} has a cyclic "extends".`);
  const parent = resolveProfile(profile.extends, [...seen, name]);
  return { ...parent, ...profile, env: { ...parent?.env, ...profile?.env } };
};

test('the App Store keeps the existing identity and Apple sign-in', () => {
  assert.equal(app.ios?.bundleIdentifier, 'is.rummal.app');
  assert.equal(app.scheme, 'rummal');
  assert.equal(app.ios?.usesAppleSignIn, true);
  assert.equal(app.ios?.supportsTablet, true);
  assert.equal(app.android?.package, 'is.rummal.app');
  assert.equal(submission.ios?.bundleIdentifier, app.ios.bundleIdentifier);
});

test('the iOS privacy manifest declares no tracking and every required-reason category', () => {
  const manifest = app.ios?.privacyManifests;
  assert.ok(manifest, 'app.json ios.privacyManifests is required for an App Store build.');
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  const declared = new Map(
    (manifest.NSPrivacyAccessedAPITypes ?? []).map((entry) => [
      entry.NSPrivacyAccessedAPIType,
      entry.NSPrivacyAccessedAPITypeReasons,
    ]),
  );
  for (const [category, reasons] of Object.entries(REQUIRED_REASONS)) {
    assert.deepEqual(
      declared.get(category),
      reasons,
      `Privacy manifest must declare ${category} with its supported reason.`,
    );
  }
});

test('iOS usage descriptions and the export-compliance answer stay present', () => {
  const info = app.ios?.infoPlist ?? {};
  for (const key of [
    'NSLocationWhenInUseUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
  ])
    assert.ok(
      typeof info[key] === 'string' && info[key].trim().length > 0,
      `Info.plist string ${key} is required for App Review.`,
    );
  // Declares only exempt encryption, so no annual self-classification report is filed.
  assert.equal(info.ITSAppUsesNonExemptEncryption, false);
});

test('an App Store profile builds from the staging guardrails and can reach TestFlight', () => {
  const profile = resolveProfile('app-store-testing');
  assert.ok(profile, 'eas.json needs an app-store-testing build profile.');
  assert.equal(profile.distribution, 'store');
  assert.equal(profile.autoIncrement, true);
  assert.equal(profile.env?.EXPO_PUBLIC_APP_ENV, 'staging');
  assert.equal(profile.env?.EXPO_PUBLIC_DEV_BYPASS_AUTH, 'false');
  assert.ok(eas.submit?.['app-store-testing']?.ios, 'A TestFlight submit profile is required.');
  assert.ok(eas.submit?.production?.ios, 'A production App Store submit profile is required.');

  const production = resolveProfile('production');
  assert.equal(production.distribution, 'store');
  assert.equal(production.env?.EXPO_PUBLIC_APP_ENV, 'production');
  assert.equal(production.env?.EXPO_PUBLIC_DEV_BYPASS_AUTH, 'false');
});

test('the store package does not claim an approval that has not happened', () => {
  assert.equal(submission.status, 'draft-unapproved');
  for (const flag of [
    'privacyLabelsApproved',
    'dataSafetyApproved',
    'ageRatingQuestionnaireApproved',
    'legalCopyApproved',
  ])
    assert.equal(submission.review?.[flag], false, `${flag} must not be pre-approved.`);
  assert.equal(submission.publicDestinations?.privacyPolicy, null);
  assert.equal(submission.publisher?.supportEmail, null);
});

test('the Apple track documents the review requirements it cannot close', () => {
  const track = fs.readFileSync(path.join(root, 'docs/apple-launch-track.md'), 'utf8');
  for (const required of [
    'App Store Connect',
    'TestFlight',
    'Sign in with Apple',
    'APNs',
    'privacy labels',
    'Iceland',
    'review notes',
    '18+',
  ])
    assert.ok(track.includes(required), `docs/apple-launch-track.md must cover ${required}.`);
});

test('no Apple key material is stored in the repository', () => {
  const roots = ['apps', 'packages', 'supabase', 'scripts', 'docs', 'docker', '.github'];
  const offenders = [];
  const inspect = (absolute, relative) => {
    let contents;
    try {
      contents = fs.readFileSync(absolute, 'utf8');
    } catch {
      return;
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)) offenders.push(relative);
  };
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name !== 'package-lock.json') inspect(absolute, relative);
    }
  };
  for (const directory of roots) {
    const absolute = path.join(root, directory);
    if (fs.existsSync(absolute)) walk(absolute);
  }
  for (const file of ['apps/mobile/app.json', 'apps/mobile/eas.json', 'docs/store-submission.json'])
    inspect(path.join(root, file), file);
  assert.deepEqual(offenders, [], 'Apple private keys belong in the credential store, not git.');
});
