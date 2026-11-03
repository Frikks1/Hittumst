import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { LiveMeetupService } from './meetupLive';

const roomId = '23a1b4d8-5a3c-441e-9cc4-eb689c83c2ef';
const eventId = '47d468c7-a5f7-4d39-b937-55f47be13c2d';
const row = { id: roomId, meetupId: eventId, title: 'Coffee', startsAt: '2026-10-12T12:00:00Z', canPost: true, isPaused: false, unreadCount: 2 };
describe('live event chat inbox RPCs', () => {
  beforeEach(() => mocks.rpc.mockReset());
  it('uses caller-bound inbox and read endpoints without an arbitrary member ID', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: null });
    const service = new LiveMeetupService();
    expect(await service.listChats()).toEqual([row]);
    await service.markRoomRead(roomId);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'list_meetup_chats');
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'mark_meetup_room_read', { room_id: roomId });
  });
  it('rejects malformed or overbroad room metadata before displaying it', async () => {
    const service = new LiveMeetupService();
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...row, address: 'Private venue' }], error: null });
    await expect(service.listChats()).rejects.toThrow();
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...row, unreadCount: -1 }], error: null });
    await expect(service.listChats()).rejects.toThrow();
  });
  it('propagates server revocation instead of retaining a successful read marker', async () => {
    const failure = { code: '42501', message: 'active_room_membership_required' };
    mocks.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(new LiveMeetupService().markRoomRead(roomId)).rejects.toBe(failure);
  });
});
