import { describe, expect, it } from 'vitest';
import { drainWorker, inspectWorkerResult } from './runner';
describe('continuous worker bounded queue draining', () => {
  it('does not hide retained raw-media cleanup failures', () => {
    const result = inspectWorkerResult('media', true, { processed: 0, cleanup: { cleaned: 2, retry: 4, object: 'private' } });
    expect(result.ok).toBe(false);
    expect(result.metrics).toEqual({ processed: 0, cleaned: 2, retry: 4 });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('requires cleanup acknowledgement even for an empty media queue', () => {
    expect(inspectWorkerResult('media', true, { processed: 0 }).ok).toBe(false);
  });
  it('drains queued work immediately and stops when idle', async () => {
    let calls = 0;
    const result = await drainWorker('media', async () => ({ ok: true, body: {
      processed: ++calls < 4 ? 1 : 0, approved: true, cleanup: { cleaned: 0, retry: 0 },
    } }));
    expect(calls).toBe(4);
    expect(result).toMatchObject({ ok: true, batches: 4, limited: false, metrics: { processed: 3 } });
  });
  it('enforces the batch bound and yields without dropping pending work', async () => {
    const result = await drainWorker('account-deletion', async () => ({ ok: true, body: { complete: 1, retry: 0 } }), { maxBatches: 3 });
    expect(result).toMatchObject({ ok: true, batches: 3, limited: true, metrics: { complete: 3 } });
  });
  it('stops after a failure and never serializes provider errors', async () => {
    const result = await drainWorker('media', async () => { throw new Error('private provider credential'); });
    expect(result).toMatchObject({ ok: false, batches: 1 });
    expect(JSON.stringify(result)).not.toContain('credential');
  });
  it('honors shutdown before claiming another job', async () => {
    const result = await drainWorker('media', async () => { throw new Error('must not run'); }, { stopping: () => true });
    expect(result.batches).toBe(0);
  });
  it('requires live billing reconciliation acknowledgement and drains pending work', () => {
    expect(inspectWorkerResult('billing', true, { processed: 1, pending: true, sandbox: false })).toMatchObject({ ok: true, busy: true });
    expect(inspectWorkerResult('billing', true, { processed: 0, pending: false, sandbox: false, disabled: true }).ok).toBe(false);
  });
  it('requires enabled voice and explicit reconciliation counts', () => {
    expect(inspectWorkerResult('voice', true, { ok: true, disabled: true, revoked: 0, ended: 0 }).ok).toBe(false);
    expect(inspectWorkerResult('voice', true, { ok: true, revoked: 1, ended: 0 }).ok).toBe(true);
    expect(inspectWorkerResult('voice', true, { ok: true }).ok).toBe(false);
  });
  it('marks push retry and delivery failures unhealthy', () => {
    expect(inspectWorkerResult('push', true, { ok: true, sent: { failed: 1 } }).ok).toBe(false);
  });
});

