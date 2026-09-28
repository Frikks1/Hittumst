import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRelease } from './release-policy.mjs';
import { inspectEvidence } from './release-evidence.mjs';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildOnly = process.argv.includes('--build');
if (buildOnly && !['production', 'staging'].includes(process.env.EXPO_PUBLIC_APP_ENV)) {
  if (process.env.EAS_BUILD_PROFILE === 'preview') {
    console.log('Internal demo preview: public-launch preflight not applicable.');
    process.exit(0);
  }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8')).expo;
const gates = buildOnly
  ? null
  : JSON.parse(fs.readFileSync(path.join(root, 'docs/launch-readiness.json'), 'utf8'));
const issues = inspectRelease(process.env, app, gates);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (app.version !== version)
  issues.push('The mobile version and repository release version must agree.');
if (!buildOnly) {
  let revision = '';
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (dirty) issues.push('A public release requires a clean, committed candidate.');
  } catch {
    issues.push('The release source revision could not be verified.');
  }
  const revisions = new Map();
  const matchesSourceRevision = (source) => {
    if (revisions.has(source)) return revisions.get(source);
    let matches = false;
    try {
      // Attestation commits may add only evidence; changing app/tooling/policy invalidates the pass.
      execFileSync('git', ['merge-base', '--is-ancestor', source, revision], {
        cwd: root,
        stdio: 'pipe',
      });
      execFileSync(
        'git',
        [
          'diff',
          '--quiet',
          source,
          revision,
          '--',
          '.',
          ':(exclude)docs/launch-readiness.json',
          ':(exclude)docs/release-evidence/**',
        ],
        { cwd: root, stdio: 'pipe' },
      );
      matches = true;
    } catch {
      /* Missing, unrelated, or changed source fails closed. */
    }
    revisions.set(source, matches);
    return matches;
  };
  issues.push(...inspectEvidence(gates, { root, version, revision, matchesSourceRevision }));
}
for (const asset of [
  app.icon,
  app.android?.adaptiveIcon?.foregroundImage,
  app.android?.adaptiveIcon?.monochromeImage,
]) {
  if (asset && !fs.existsSync(path.resolve(root, 'apps/mobile', asset)))
    issues.push('Configured native icon file is missing.');
}
if (issues.length) {
  console.error('Release is blocked:\n' + issues.map((issue) => ' - ' + issue).join('\n'));
  process.exitCode = 1;
} else
  console.log(
    buildOnly
      ? 'Build configuration checks passed. This does not establish launch approval.'
      : 'Recorded launch gates and configuration passed. Reconfirm store and advertising approvals before publishing.',
  );
