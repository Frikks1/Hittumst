import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectEvidence, launchGates } from './release-evidence.mjs';

const revision = 'a'.repeat(40);
const version = '0.1.0';
const now = new Date('2026-09-08T12:00:00Z');
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hittumst-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'evidence'));
  const body = 'Sanitized synthetic verification result.';
  writeFileSync(path.join(root, 'evidence/result.txt'), body);
  const gate = {
    status: 'verified',
    releaseVersion: version,
    sourceRevision: revision,
    verifiedBy: 'Named release verifier',
    verifiedAt: '2026-09-08T10:00:00Z',
    expiresAt: '2026-09-15T10:00:00Z',
    evidence: 'Reviewed synthetic evidence',
    artifacts: [
      { path: 'evidence/result.txt', sha256: createHash('sha256').update(body).digest('hex') },
    ],
  };
  const gates = Object.fromEntries(launchGates.map((name) => [name, structuredClone(gate)]));
  return { root, gates, context: { root, version, revision, now } };
}
test('complete evidence matches exact candidate and artifact bytes', (t) => {
  const { gates, context } = fixture(t);
  assert.deepEqual(inspectEvidence(gates, context), []);
});
test('unverified subscriptions, commerce and voice cannot silently leave the launch scope', (t) => {
  const { gates, context } = fixture(t);
  delete gates.subscriptions;
  delete gates.commerce;
  delete gates.voice;
  const issues = inspectEvidence(gates, context);
  assert.equal(issues.length, 3);
  assert.ok(issues.some((issue) => issue.includes('subscriptions')));
  assert.ok(issues.some((issue) => issue.includes('commerce')));
  assert.ok(issues.some((issue) => issue.includes('voice')));
});
test('stale, future, wrong-version and wrong-source evidence is rejected', (t) => {
  const { gates, context } = fixture(t);
  gates.backend.verifiedAt = '2027-01-01T00:00:00Z';
  gates.media.expiresAt = '2026-09-01T00:00:00Z';
  gates.recovery.releaseVersion = '0.0.1';
  gates.hittingar.sourceRevision = 'b'.repeat(40);
  const issues = inspectEvidence(gates, context);
  for (const term of ['backend', 'media', 'recovery', 'hittingar'])
    assert.ok(issues.some((issue) => issue.includes(term)));
});
test('altered, missing, external and traversal artifacts fail closed', (t) => {
  const { root, gates, context } = fixture(t);
  gates.backend.artifacts[0].sha256 = '0'.repeat(64);
  gates.privacy.artifacts[0].path = 'missing.json';
  gates.media.artifacts[0].path = '../outside.json';
  gates.operations.artifacts[0].path = path.join(root, 'evidence/result.txt');
  assert.equal(inspectEvidence(gates, context).length, 4);
});
test('an evidence-only attestation commit may reference verified source, but changes fail', (t) => {
  const { gates, context } = fixture(t);
  const parent = 'b'.repeat(40);
  gates.backend.sourceRevision = parent;
  assert.deepEqual(
    inspectEvidence(gates, {
      ...context,
      matchesSourceRevision: (source) => [revision, parent].includes(source),
    }),
    [],
  );
  assert.ok(
    inspectEvidence(gates, {
      ...context,
      matchesSourceRevision: (source) => source === revision,
    }).some((issue) => issue.includes('backend')),
  );
});
test('a pass needs a named human and hashed artifacts', (t) => {
  const { gates, context } = fixture(t);
  gates.backend.verifiedBy = ' ';
  gates.backend.artifacts = [];
  assert.equal(inspectEvidence(gates, context).length, 2);
});
