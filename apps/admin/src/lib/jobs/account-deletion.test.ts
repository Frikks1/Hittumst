import { describe, expect, it, vi } from 'vitest';
import { runDeletionJob, type DeletionOperations } from './account-deletion';

const job = { id: 'job', account_id: 'synthetic-member', objects: [{ bucket: 'album-media', name: 'one' }] };
const operations = (): DeletionOperations => ({ removeObjects: vi.fn(async () => {}), deleteAuthUser: vi.fn(async () => {}), finish: vi.fn(async () => {}) });
describe('durable deletion', () => {
  it('keeps the Auth record restricted and schedules retry if media cleanup fails', async () => {
    const ops = operations(); vi.mocked(ops.removeObjects).mockRejectedValueOnce(new Error('temporary storage failure'));
    expect(await runDeletionJob(job, ops)).toBe(false);
    expect(ops.deleteAuthUser).not.toHaveBeenCalled();
    expect(ops.finish).toHaveBeenCalledWith('job', false);
    expect(await runDeletionJob(job, ops)).toBe(true);
    expect(ops.finish).toHaveBeenLastCalledWith('job', true);
  });
  it('chunks large media manifests before removing authentication', async () => {
    const ops = operations();
    await runDeletionJob({ ...job, objects: Array.from({ length: 205 }, (_, n) => ({ bucket: 'album-media', name: String(n) })) }, ops);
    expect(vi.mocked(ops.removeObjects).mock.calls.map(call => call[1].length)).toEqual([100, 100, 5]);
    expect(ops.deleteAuthUser).toHaveBeenCalledOnce();
  });
});
