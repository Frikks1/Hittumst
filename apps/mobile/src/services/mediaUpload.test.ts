import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), upload: vi.fn(), reserveHeader: vi.fn(), cancelHeader: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: {
  auth: { getSession: mocks.session }, rpc: mocks.rpc,
  storage: { from: () => ({ upload: mocks.upload }) },
} }));
import { queueMediaUpload } from './mediaUpload';

const session = (id = 'owner', token = 'owner-token') => ({ data: { session: { user: { id }, access_token: token } }, error: null });
const reservation = { data: { id: 'upload-id', path: 'owner/upload-id/original', bucket: 'media-quarantine' }, error: null };
const upload = (scope = {}) => queueMediaUpload('group', 'group-id', 'file:///camera.jpg', 'image', 'image/jpeg', [], {}, scope);

beforeEach(() => {
  mocks.session.mockResolvedValue(session());
  mocks.reserveHeader.mockResolvedValue(reservation);
  mocks.cancelHeader.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockImplementation((name: string) => ({ setHeader: name === 'reserve_media_upload' ? mocks.reserveHeader : mocks.cancelHeader }));
  mocks.upload.mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('camera media account isolation', () => {
  it('pins all upload writes to the initiating member session', async () => {
    expect(await upload({ accountId: 'owner' })).toBe('upload-id');
    expect(mocks.reserveHeader).toHaveBeenCalledWith('Authorization', 'Bearer owner-token');
    expect(mocks.upload).toHaveBeenCalledWith(reservation.data.path, expect.any(ArrayBuffer), expect.objectContaining({ headers: { Authorization: 'Bearer owner-token' }, upsert: false }));
  });

  it('does not read camera bytes for the wrong account or a closed screen', async () => {
    await expect(upload({ accountId: 'other' })).rejects.toThrow('authentication_required');
    await expect(upload({ isCurrent: () => false })).rejects.toThrow('authentication_required');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not reserve media when the account changes while reading the file', async () => {
    mocks.session.mockResolvedValueOnce(session()).mockResolvedValue(session('other'));
    await expect(upload()).rejects.toThrow('authentication_required');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('cancels an existing reservation using its original session after an account switch', async () => {
    mocks.session.mockResolvedValueOnce(session()).mockResolvedValueOnce(session()).mockResolvedValue(session('other'));
    await expect(upload()).rejects.toThrow('authentication_required');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_media_upload', { upload_id: 'upload-id' });
    expect(mocks.cancelHeader).toHaveBeenCalledWith('Authorization', 'Bearer owner-token');
  });

  it('cancels the reservation when an upload fails without reporting delivery', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('upload_failed') });
    await expect(upload()).rejects.toThrow('upload_failed');
    expect(mocks.cancelHeader).toHaveBeenCalledWith('Authorization', 'Bearer owner-token');
  });

  it('rejects oversized media before making any reservation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(50 * 1024 * 1024 + 1) }));
    await expect(upload()).rejects.toThrow('invalid_media_size');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
