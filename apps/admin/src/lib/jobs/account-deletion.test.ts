import { describe, expect, it, vi } from 'vitest';
import { runDeletionJob, type DeletionOperations } from './account-deletion';

const job = { id: 'job', account_id: 'synthetic-member', objects: [{ bucket: 'album-media', name: 'one' }] };
const operations = (): DeletionOperations => ({ publishDeletionTombstone: vi.fn(async () => {}), revokeIdentityProvider: vi.fn(async () => {}), removeObjects: vi.fn(async () => {}), deleteAuthUser: vi.fn(async () => {}), finish: vi.fn(async () => {}) });
describe('durable deletion', () => {
  it('does not remove bytes or identity before the external journal confirms durability', async () => {
    const ops=operations();vi.mocked(ops.publishDeletionTombstone).mockRejectedValueOnce(new Error('journal unavailable'));
    expect(await runDeletionJob(job,ops)).toBe(false);expect(ops.removeObjects).not.toHaveBeenCalled();
    expect(ops.deleteAuthUser).not.toHaveBeenCalled();expect(ops.finish).toHaveBeenCalledWith('job',false);
    expect(await runDeletionJob(job,ops)).toBe(true);
  });
  it('retries safely after publication succeeds but the final acknowledgement fails',async()=>{
    const ops=operations();vi.mocked(ops.finish).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await runDeletionJob(job,ops)).toBe(false);expect(await runDeletionJob(job,ops)).toBe(true);
    expect(ops.publishDeletionTombstone).toHaveBeenCalledTimes(2);
    expect(ops.finish).toHaveBeenLastCalledWith('job',true);
  });
  it('keeps the Auth record restricted and schedules retry if media cleanup fails', async () => {
    const ops = operations(); vi.mocked(ops.removeObjects).mockRejectedValueOnce(new Error('temporary storage failure'));
    expect(await runDeletionJob(job, ops)).toBe(false);
    expect(ops.deleteAuthUser).not.toHaveBeenCalled();
    expect(ops.finish).toHaveBeenCalledWith('job', false);
    expect(await runDeletionJob(job, ops)).toBe(true);
    expect(ops.finish).toHaveBeenLastCalledWith('job', true);
  });
  it('retains the restricted Auth identity until Apple confirms token revocation', async () => {
    const ops = operations();
    vi.mocked(ops.revokeIdentityProvider).mockRejectedValueOnce(new Error('apple_revocation_pending'));
    expect(await runDeletionJob(job, ops)).toBe(false);
    expect(ops.deleteAuthUser).not.toHaveBeenCalled();
    expect(ops.finish).toHaveBeenCalledWith('job', false);
    expect(await runDeletionJob(job, ops)).toBe(true);
    expect(ops.deleteAuthUser).toHaveBeenCalledOnce();
  });
  it('chunks large media manifests before removing authentication', async () => {
    const ops = operations();
    await runDeletionJob({ ...job, objects: Array.from({ length: 205 }, (_, n) => ({ bucket: 'album-media', name: String(n) })) }, ops);
    expect(vi.mocked(ops.removeObjects).mock.calls.map(call => call[1].length)).toEqual([100, 100, 5]);
    expect(ops.deleteAuthUser).toHaveBeenCalledOnce();
  });
});
