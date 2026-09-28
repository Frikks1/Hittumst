import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => 'asset-id' }));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrls: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.from } } }));
import { LiveMeetupService } from './meetupLive';

describe('Event media access and uploads', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue({ upload: mocks.upload, remove: mocks.remove, createSignedUrls: mocks.createSignedUrls });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null, data: { id:'upload-id',path:'owner/upload-id',bucket:'media-quarantine' } });
  });
  it('reserves private quarantine bytes without registering unreviewed event metadata', async () => {
    await new LiveMeetupService().uploadMedia('event-id', 'data:image/png;base64,aGVsbG8=', 'photo', 'image/png');
    expect(mocks.from).toHaveBeenCalledWith('media-quarantine');
    expect(mocks.upload).toHaveBeenCalledWith('owner/upload-id', expect.any(ArrayBuffer), { contentType:'image/png',upsert:false,cacheControl:'0' });
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_media_upload', { target_type:'meetup',target_id:'event-id',media_type:'image',metadata:{tags:[]} });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('cannot upload if event admission rejects the reservation', async () => {
    mocks.rpc.mockResolvedValue({ error: new Error('media_limit_reached') });
    await expect(new LiveMeetupService().uploadMedia('event-id', 'data:video/mp4;base64,aGVsbG8=', 'video', 'video/mp4')).rejects.toThrow('media_limit_reached');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('marks a reservation failed if the actual Storage upload fails', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('storage_failure') });
    await expect(new LiveMeetupService().uploadMedia('event-id', 'data:image/png;base64,aGVsbG8=', 'photo', 'image/png')).rejects.toThrow('storage_failure');
    expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_media_upload',{upload_id:'upload-id'});
  });
  it('rejects mismatched media types before any upload', async () => {
    await expect(new LiveMeetupService().uploadMedia('event-id', 'data:,x', 'photo', 'video/mp4')).rejects.toThrow('invalid_media_type');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('resolves only authorized metadata into short-lived URLs', async () => {
    mocks.rpc.mockResolvedValue({ error:null,data:[{id:'1',kind:'video',path:'event-id/video.mp4',position:0}] });
    mocks.createSignedUrls.mockResolvedValue({ error:null,data:[{signedUrl:'https://example.test/signed-video'}] });
    expect(await new LiveMeetupService().listMedia('event-id')).toEqual([{id:'1',kind:'video',url:'https://example.test/signed-video',position:0}]);
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(['event-id/video.mp4'],300);
  });
});
