import { describe, expect, it, vi } from 'vitest';
import { processMediaJob, processMediaCleanup, mediaLimits, mediaDestination, mediaBucket, type MediaOperations } from './media-worker';
const job = { id: 'upload', owner_id: 'owner', album_id: 'album', object_path: 'owner/source', media_type: 'image' as const };
function operations(): MediaOperations {
  return { download: vi.fn(async () => new Uint8Array([1])),
    normalize: vi.fn(async () => ({ bytes: Buffer.from([1,2]), thumbnail: Buffer.from([3]), width: 20, height: 20, durationMs: null })),
    moderate: vi.fn(async () => true), upload: vi.fn(async () => {}),
    finish: vi.fn(async () => true), fail: vi.fn(async () => {}) };
}
describe('media processing recovery', () => {
  it('uses stable destination keys and only finalizes after both uploads', async () => {
    const ops = operations();
    expect(await processMediaJob(job, ops)).toEqual({ processed: 1, approved: true });
    expect(vi.mocked(ops.upload).mock.calls.map(c => c[1])).toEqual(['owner/album/upload.jpg','owner/album/upload-thumb.jpg']);
    expect(vi.mocked(ops.finish).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(ops.upload).mock.invocationCallOrder[1]!);
    expect(ops.fail).not.toHaveBeenCalled();
  });
  it('retries transient provider failure without publishing an unmoderated file', async () => {
    const ops = operations(); vi.mocked(ops.moderate).mockRejectedValueOnce(new Error('provider timeout'));
    await expect(processMediaJob(job, ops)).rejects.toThrow('media_retry_required');
    expect(ops.upload).not.toHaveBeenCalled(); expect(ops.finish).not.toHaveBeenCalled();
    expect(ops.fail).toHaveBeenCalledWith(false);
  });
  it('quarantines invalid decoded content without retrying the processor', async () => {
    const ops = operations(); vi.mocked(ops.normalize).mockRejectedValueOnce(new Error('invalid_duration'));
    await expect(processMediaJob(job, ops)).rejects.toThrow();
    expect(ops.fail).toHaveBeenCalledWith(true); expect(ops.moderate).not.toHaveBeenCalled();
  });
  it('rejects expired publication claims and leaves recovery to the durable queue', async () => {
    const ops = operations(); vi.mocked(ops.finish).mockResolvedValueOnce(false);
    await expect(processMediaJob(job, ops)).rejects.toThrow(); expect(ops.fail).toHaveBeenCalledWith(false);
  });
  it('human review still requires normalization and uploads no rejected content', async () => {
    const approved = operations(); await processMediaJob({ ...job, review_approved: true }, approved);
    expect(approved.normalize).toHaveBeenCalled(); expect(approved.moderate).not.toHaveBeenCalled();
    const rejected = operations(); vi.mocked(rejected.moderate).mockResolvedValue(false);
    expect(await processMediaJob(job, rejected)).toEqual({ processed: 1, approved: false });
    expect(rejected.upload).not.toHaveBeenCalled();
    expect(rejected.finish).toHaveBeenCalledWith(expect.objectContaining({ rejection_reason: 'moderation_review_required' }));
  });
  it('continues cleanup after a storage failure and preserves its retry', async () => {
    const remove = vi.fn(async () => {}); remove.mockRejectedValueOnce(new Error('storage unavailable'));
    const finish = vi.fn(async () => true);
    expect(await processMediaCleanup([{ id:'1',bucket:'media-quarantine',name:'a' },{ id:'2',bucket:'media-quarantine',name:'b' }], { remove, finish })).toEqual({ cleaned:1,retry:1 });
    expect(finish).toHaveBeenNthCalledWith(1,'1',false); expect(finish).toHaveBeenNthCalledWith(2,'2',true);
  });
  it('does not claim cleanup succeeded when completion cannot be persisted', async () => {
    const finish = vi.fn(async () => false);
    expect(await processMediaCleanup([{ id:'1',bucket:'media-quarantine',name:'a' }], { remove: async () => {}, finish })).toEqual({ cleaned:0,retry:1 });
    expect(finish).toHaveBeenLastCalledWith('1',false);
  });
});

it('preserves per-feature media budgets and deterministic output locations', () => {
  expect(mediaLimits('profile_video')).toEqual({maxBytes:50*1024*1024,maxDurationMs:10000});
  expect(mediaLimits('meetup')).toEqual({maxBytes:50*1024*1024,maxDurationMs:null});
  expect(mediaLimits('message').maxBytes).toBe(10*1024*1024);
  expect(mediaDestination({...job,target_type:'meetup',target_id:'event'})).toBe('event/upload.jpg');
  expect(mediaDestination({...job,target_type:'message',target_id:'conversation'})).toBe('owner/upload.jpg');
  expect(mediaBucket('profile_video')).toBe('profile-videos');
});
it('publishes one reviewed message image without an unused thumbnail', async () => {
  const ops=operations();
  await processMediaJob({...job,target_type:'message',target_id:'conversation'},ops);
  expect(ops.upload).toHaveBeenCalledTimes(1);
  expect(ops.upload).toHaveBeenCalledWith('message-images','owner/upload.jpg',expect.any(Uint8Array),'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({thumbnail_path:null}));
});
it('publishes a reviewed meetup video and its poster atomically through finalization', async () => {
  const ops = operations();
  await processMediaJob({ ...job, media_type: 'video', target_type: 'meetup', target_id: 'event' }, ops);
  expect(ops.upload).toHaveBeenCalledWith('meetup-media', 'event/upload.mp4', expect.any(Uint8Array), 'video/mp4');
  expect(ops.upload).toHaveBeenCalledWith('meetup-media', 'event/upload-thumb.jpg', expect.any(Uint8Array), 'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ thumbnail_path: 'event/upload-thumb.jpg' }));
  expect(vi.mocked(ops.finish).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(ops.upload).mock.invocationCallOrder[1]!);
});
