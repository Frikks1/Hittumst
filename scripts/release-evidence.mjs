import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const launchGates = Object.freeze([
  'backend',
  'privacy',
  'moderation',
  'deviceTesting',
  'storeMetadata',
  'recovery',
  'hittingar',
  'capacity',
  'media',
  'accountLifecycle',
  'operations',
  'subscriptions',
  'commerce',
  'voice',
]);

// A recorded approval is meaningful only for a specific build and immutable evidence.
// This validates the record's integrity, never the truth of a human attestation.
export function inspectEvidence(
  gates,
  {
    root,
    version,
    revision,
    matchesSourceRevision = (source) => source === revision,
    now = new Date(),
  },
) {
  const issues = [];
  const rootPath = fs.realpathSync(root);
  for (const name of launchGates) {
    const gate = gates?.[name];
    const prefix = `Launch evidence ${name}: `;
    if (gate?.status !== 'verified') {
      issues.push(`${prefix}not verified.`);
      continue;
    }
    if (gate.releaseVersion !== version)
      issues.push(`${prefix}release version does not match ${version}.`);
    if (
      !/^[a-f0-9]{40}$/.test(revision ?? '') ||
      !/^[a-f0-9]{40}$/.test(gate.sourceRevision ?? '') ||
      !matchesSourceRevision(gate.sourceRevision)
    )
      issues.push(`${prefix}source revision does not match the release candidate.`);
    if (typeof gate.verifiedBy !== 'string' || !gate.verifiedBy.trim())
      issues.push(`${prefix}named verifier is required.`);
    const verifiedAt = Date.parse(gate.verifiedAt ?? '');
    const expiresAt = Date.parse(gate.expiresAt ?? '');
    if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime())
      issues.push(`${prefix}verification date is invalid or in the future.`);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime() || expiresAt <= verifiedAt)
      issues.push(`${prefix}unexpired evidence is required.`);
    if (typeof gate.evidence !== 'string' || !gate.evidence.trim())
      issues.push(`${prefix}a human-readable evidence summary is required.`);
    if (!Array.isArray(gate.artifacts) || gate.artifacts.length === 0) {
      issues.push(`${prefix}at least one sanitized, hashed evidence artifact is required.`);
      continue;
    }
    for (const artifact of gate.artifacts) {
      try {
        if (
          !artifact ||
          typeof artifact.path !== 'string' ||
          path.isAbsolute(artifact.path) ||
          /(^|[\\/])\.\.([\\/]|$)/.test(artifact.path)
        )
          throw new Error();
        const target = fs.realpathSync(path.resolve(rootPath, artifact.path));
        const relative = path.relative(rootPath, target);
        if (
          !relative ||
          relative.startsWith('..') ||
          path.isAbsolute(relative) ||
          !fs.statSync(target).isFile()
        )
          throw new Error();
        if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error();
        const digest = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
        if (digest !== artifact.sha256) throw new Error();
      } catch {
        issues.push(
          `${prefix}artifact is missing, outside the repository, or does not match its SHA-256.`,
        );
      }
    }
  }
  return issues;
}
