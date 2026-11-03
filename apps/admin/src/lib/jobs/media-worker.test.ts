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

it('routes attendee memories through inspected meetup storage with a video poster', async () => {
  const ops = operations();
  await processMediaJob({ ...job, media_type: 'video', target_type: 'meetup_memory', target_id: 'event' }, ops);
  expect(mediaLimits('meetup_memory')).toEqual({ maxBytes: 50 * 1024 * 1024, maxDurationMs: null });
  expect(ops.normalize).toHaveBeenCalled();
  expect(ops.moderate).toHaveBeenCalled();
  expect(ops.upload).toHaveBeenCalledWith('meetup-media', 'event/upload.mp4', expect.any(Uint8Array), 'video/mp4');
  expect(ops.upload).toHaveBeenCalledWith('meetup-media', 'event/upload-thumb.jpg', expect.any(Uint8Array), 'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ thumbnail_path: 'event/upload-thumb.jpg' }));
});

function gifOperations(): MediaOperations {
  const ops = operations();
  vi.mocked(ops.normalize).mockResolvedValue({ bytes: Buffer.from('GIF89a'), thumbnail: Buffer.from([3]), width: 20, height: 20,
    durationMs: null, contentType: 'image/gif', moderationFrames: [Buffer.from([10]), Buffer.from([20]), Buffer.from([30])] });
  return ops;
}
it('reviews every GIF frame and uploads the animation and static poster before publication', async () => {
  const ops = gifOperations();
  await processMediaJob({ ...job, target_type: 'profile_photo', target_id: 'owner' }, ops);
  expect(ops.normalize).toHaveBeenCalledWith(expect.any(Uint8Array), 'image', { maxBytes: 10 * 1024 * 1024, maxDurationMs: null, allowAnimatedImages: true });
  expect(vi.mocked(ops.moderate).mock.calls).toEqual([[Buffer.from([10]), 'image'], [Buffer.from([20]), 'image'], [Buffer.from([30]), 'image']]);
  expect(ops.upload).toHaveBeenCalledWith('profile-photos', 'owner/upload.gif', expect.any(Uint8Array), 'image/gif');
  expect(ops.upload).toHaveBeenCalledWith('profile-photos', 'owner/upload-thumb.jpg', expect.any(Uint8Array), 'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ object_path: 'owner/upload.gif', thumbnail_path: 'owner/upload-thumb.jpg' }));
  expect(vi.mocked(ops.finish).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(ops.upload).mock.invocationCallOrder[1]!);
});
it('rejects a GIF when a later frame fails moderation and keeps both outputs private', async () => {
  const ops = gifOperations();
  vi.mocked(ops.moderate).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await processMediaJob({ ...job, target_type: 'profile_photo', target_id: 'owner' }, ops)).toEqual({ processed: 1, approved: false });
  expect(ops.upload).not.toHaveBeenCalled();
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ rejection_reason: 'moderation_review_required' }));
});
it('leaves a GIF unpublished if its accessibility poster upload fails', async () => {
  const ops = gifOperations();
  vi.mocked(ops.upload).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(processMediaJob({ ...job, target_type: 'profile_photo', target_id: 'owner' }, ops)).rejects.toThrow('media_retry_required');
  expect(ops.finish).not.toHaveBeenCalled();
  expect(ops.fail).toHaveBeenCalledWith(false);
});
it('retries GIF moderation failures and never approves animation without decoded frames', async () => {
  const ops = gifOperations();
  vi.mocked(ops.moderate).mockRejectedValueOnce(new Error('provider timeout'));
  await expect(processMediaJob({ ...job, target_type: 'profile_photo', target_id: 'owner' }, ops)).rejects.toThrow('media_retry_required');
  expect(ops.fail).toHaveBeenCalledWith(false);
  expect(ops.upload).not.toHaveBeenCalled();
  const missingFrames = gifOperations();
  vi.mocked(missingFrames.normalize).mockResolvedValue({ bytes: Buffer.from('GIF89a'), thumbnail: Buffer.from([3]), width: 20, height: 20, durationMs: null, contentType: 'image/gif' });
  await expect(processMediaJob({ ...job, target_type: 'profile_photo', target_id: 'owner', review_approved: true }, missingFrames)).rejects.toThrow('media_retry_required');
  expect(missingFrames.fail).toHaveBeenCalledWith(true);
  expect(missingFrames.upload).not.toHaveBeenCalled();
});
it('cannot publish a normalized GIF outside profile photos', async () => {
  for (const target_type of ['album', 'message', 'meetup', 'meetup_memory', 'meetup_room_message', 'meetup_room_avatar', 'profile_video', 'showcase', 'strax'] as const) {
    const ops = gifOperations();
    await expect(processMediaJob({ ...job, target_type, target_id: 'room' }, ops)).rejects.toThrow('media_retry_required');
    expect(ops.fail).toHaveBeenCalledWith(true);
    expect(ops.upload).not.toHaveBeenCalled();
  }
});

it('publishes Strax photos through moderation with a 10 MiB limit and rejects video', async () => {
  const ops = operations();
  await processMediaJob({ ...job, target_type: 'strax', target_id: 'activity' }, ops);
  expect(mediaLimits('strax')).toEqual({ maxBytes: 10 * 1024 * 1024, maxDurationMs: null });
  expect(ops.moderate).toHaveBeenCalledWith(expect.any(Uint8Array), 'image');
  expect(ops.upload).toHaveBeenCalledWith('strax-media', 'activity/upload.jpg', expect.any(Uint8Array), 'image/jpeg');
  const invalid = operations();
  await expect(processMediaJob({ ...job, target_type: 'strax', target_id: 'activity', media_type: 'video' }, invalid)).rejects.toThrow('media_retry_required');
  expect(invalid.fail).toHaveBeenCalledWith(true);
  expect(invalid.upload).not.toHaveBeenCalled();
});

it('publishes a moderated showcase video and poster before accepting its worker claim', async () => {
  const ops = operations();
  await processMediaJob({ ...job, media_type: 'video', target_type: 'showcase', target_id: 'collection' }, ops);
  expect(mediaLimits('showcase')).toEqual({ maxBytes: 50 * 1024 * 1024, maxDurationMs: null });
  expect(ops.moderate).toHaveBeenCalledWith(expect.any(Uint8Array), 'video');
  expect(ops.upload).toHaveBeenCalledWith('showcase-media', 'collection/upload.mp4', expect.any(Uint8Array), 'video/mp4');
  expect(ops.upload).toHaveBeenCalledWith('showcase-media', 'collection/upload-thumb.jpg', expect.any(Uint8Array), 'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ object_path: 'collection/upload.mp4', thumbnail_path: 'collection/upload-thumb.jpg' }));
  expect(vi.mocked(ops.finish).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(ops.upload).mock.invocationCallOrder[1]!);
});

it('publishes room photos and owner avatars into private room-scoped storage with a 10 MiB budget', async () => {
  for (const target_type of ['meetup_room_message', 'meetup_room_avatar'] as const) {
    const ops = operations();
    await processMediaJob({ ...job, target_type, target_id: 'room' }, ops);
    expect(ops.normalize).toHaveBeenCalledWith(expect.any(Uint8Array), 'image', { maxBytes: 10 * 1024 * 1024, maxDurationMs: null });
    expect(ops.moderate).toHaveBeenCalledWith(expect.any(Uint8Array), 'image');
    expect(ops.upload).toHaveBeenCalledExactlyOnceWith('meetup-room-media', 'room/upload.jpg', expect.any(Uint8Array), 'image/jpeg');
    expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ object_path: 'room/upload.jpg', thumbnail_path: null, rejection_reason: null }));
    expect(mediaBucket(target_type)).toBe('meetup-room-media');
    expect(mediaDestination({ ...job, target_type, target_id: 'room' })).toBe('room/upload.jpg');
  }
});

it('moderates room videos with a 50 MiB budget and finalizes only after their poster uploads', async () => {
  const ops = operations();
  await processMediaJob({ ...job, media_type: 'video', target_type: 'meetup_room_message', target_id: 'room' }, ops);
  expect(ops.normalize).toHaveBeenCalledWith(expect.any(Uint8Array), 'video', { maxBytes: 50 * 1024 * 1024, maxDurationMs: null });
  expect(ops.moderate).toHaveBeenCalledWith(expect.any(Uint8Array), 'video');
  expect(ops.upload).toHaveBeenCalledWith('meetup-room-media', 'room/upload.mp4', expect.any(Uint8Array), 'video/mp4');
  expect(ops.upload).toHaveBeenCalledWith('meetup-room-media', 'room/upload-thumb.jpg', expect.any(Uint8Array), 'image/jpeg');
  expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ object_path: 'room/upload.mp4', thumbnail_path: 'room/upload-thumb.jpg', rejection_reason: null }));
  expect(vi.mocked(ops.finish).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(ops.upload).mock.invocationCallOrder[1]!);
});

it('keeps rejected room photos, avatars, videos, and posters out of approved storage', async () => {
  for (const target_type of ['meetup_room_message', 'meetup_room_avatar'] as const) {
    const mediaTypes = target_type === 'meetup_room_avatar' ? ['image'] as const : ['image', 'video'] as const;
    for (const media_type of mediaTypes) {
      const ops = operations();
      vi.mocked(ops.moderate).mockResolvedValue(false);
      expect(await processMediaJob({ ...job, target_type, target_id: 'room', media_type }, ops)).toEqual({ processed: 1, approved: false });
      expect(ops.upload).not.toHaveBeenCalled();
      expect(ops.finish).toHaveBeenCalledWith(expect.objectContaining({ rejection_reason: 'moderation_review_required' }));
      expect(ops.fail).not.toHaveBeenCalled();
    }
  }
});

it('does not publish room video when moderation or poster storage fails', async () => {
  const roomVideo = { ...job, media_type: 'video' as const, target_type: 'meetup_room_message' as const, target_id: 'room' };
  const moderation = operations();
  vi.mocked(moderation.moderate).mockRejectedValueOnce(new Error('provider timeout'));
  await expect(processMediaJob(roomVideo, moderation)).rejects.toThrow('media_retry_required');
  expect(moderation.upload).not.toHaveBeenCalled();
  expect(moderation.finish).not.toHaveBeenCalled();
  expect(moderation.fail).toHaveBeenCalledWith(false);
  const poster = operations();
  vi.mocked(poster.upload).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(processMediaJob(roomVideo, poster)).rejects.toThrow('media_retry_required');
  expect(poster.finish).not.toHaveBeenCalled();
  expect(poster.fail).toHaveBeenCalledWith(false);
});

it('rejects videos as room avatars and room media without a room before processing', async () => {
  const cases = [
    { target_type: 'meetup_room_avatar' as const, target_id: 'room', media_type: 'video' as const },
    { target_type: 'meetup_room_avatar' as const, target_id: undefined, media_type: 'image' as const },
    { target_type: 'meetup_room_message' as const, target_id: undefined, media_type: 'video' as const },
  ];
  for (const invalid of cases) {
    const ops = operations();
    await expect(processMediaJob({ ...job, ...invalid }, ops)).rejects.toThrow('media_retry_required');
    expect(ops.fail).toHaveBeenCalledWith(true);
    expect(ops.download).not.toHaveBeenCalled();
    expect(ops.normalize).not.toHaveBeenCalled();
    expect(ops.upload).not.toHaveBeenCalled();
    expect(ops.finish).not.toHaveBeenCalled();
  }
});
