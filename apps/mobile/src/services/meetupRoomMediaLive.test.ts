import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), from: vi.fn(), queue: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.from } } }));
vi.mock('./mediaUpload', () => ({ queueMediaUpload: mocks.queue }));
import { LiveMeetupService } from './meetupLive';

const roomId = '23a1b4d8-5a3c-441e-9cc4-eb689c83c2ef';
const meetupId = '47d468c7-a5f7-4d39-b937-55f47be13c2d';
const memberId = '739b8728-079d-4ea8-a787-5d60aa1dd6f5';
const messageId = 'a7ae78bc-4230-4682-aad1-8ee9f0ff8b89';
const pending = { id: messageId, roomId, sender: { id: memberId, displayName: 'Aron' }, kind: 'photo', body: '', linkHostnames: [], createdAt: '2026-10-13T12:00:00Z', media: { kind: 'photo', status: 'pending' } };

describe('authorized event chat photos, members and attachments', () => {
  it('keeps incomplete legacy polls readable and omits raw or malformed extras', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { items: [{
      ...pending, kind: 'poll', media: undefined, body: null, poll: { legacy: true },
      replyTo: { id: messageId, unavailable: true, body: 'Old hidden text', senderName: 'Hidden member' },
      reactions: [{ emoji: '👍', count: -1, reacted: true }], rawModeratorNotes: 'Private internal data',
    }], nextCursor: null } });
    const message = (await new LiveMeetupService().listRoomMessages(roomId)).items[0]!;
    expect(message).toMatchObject({ kind: 'poll', body: '', replyTo: { id: messageId, unavailable: true } });
    expect(message.poll).toBeUndefined();
    expect(message.reactions).toBeUndefined();
    expect(message).not.toHaveProperty('rawModeratorNotes');
  });

  it('preserves neutral poll inbox previews and the supported mute flag', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [{ id: roomId, meetupId, title: 'Coffee', startsAt: '2026-10-13T12:00:00Z',
      canPost: false, isPaused: false, unreadCount: 1, lastMessage: '', lastMessageKind: 'poll', muted: true,
    }] });
    const chat = (await new LiveMeetupService().listChats())[0]!;
    expect(chat).toMatchObject({ lastMessageKind: 'poll', muted: true });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue({ createSignedUrls: mocks.sign });
    mocks.sign.mockImplementation(async (paths: string[]) => ({ error: null, data: paths.map(path => ({ path, signedUrl: `https://storage.test/${path}` })) }));
    mocks.queue.mockResolvedValue('upload-id');
  });

  it('signs the host chat picture without exposing its storage path', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { id: roomId, meetupId, title: 'Coffee', avatarPath: 'room/avatar.jpg', canManageAvatar: true, isPaused: false, canPost: true, postingClosesAt: '2026-10-13T20:00:00Z', readingClosesAt: '2026-10-14T18:00:00Z' } });
    const room = await new LiveMeetupService().getRoom(meetupId);
    expect(room).toMatchObject({ title: 'Coffee', avatarUrl: 'https://storage.test/room/avatar.jpg', canManageAvatar: true });
    expect(room).not.toHaveProperty('avatarPath');
    expect(mocks.from).toHaveBeenCalledWith('meetup-room-media');
    expect(mocks.sign).toHaveBeenCalledWith(['room/avatar.jpg'], 60);
  });

  it('uses a member-only endpoint and authorized profile pictures for the roster', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [{ role: 'host', profile: { id: memberId, displayName: 'Aron', avatarPath: 'member/avatar.jpg' } }] });
    const members = await new LiveMeetupService().listRoomMembers(roomId);
    expect(members).toEqual([{ role: 'host', profile: { id: memberId, displayName: 'Aron', avatarUrl: 'https://storage.test/member/avatar.jpg' } }]);
    expect(mocks.rpc).toHaveBeenCalledWith('list_meetup_room_members', { room_id: roomId });
    expect(mocks.from).toHaveBeenCalledWith('profile-photos');
  });
  it('signs the chat picture in inbox previews and retains the attachment kind', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [{ id: roomId, meetupId, title: 'Coffee', startsAt: '2026-10-13T12:00:00Z', canPost: true, isPaused: false, unreadCount: 1, avatarPath: 'room/avatar.jpg', lastMessage: '', lastMessageKind: 'photo' }] });
    const chat = (await new LiveMeetupService().listChats())[0]!;
    expect(chat).toMatchObject({ avatarUrl: 'https://storage.test/room/avatar.jpg', lastMessageKind: 'photo' });
    expect(chat).not.toHaveProperty('avatarPath');
  });
  it('does not sign a chat picture from a paused room preview', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [{ id: roomId, meetupId, title: 'Coffee', startsAt: '2026-10-13T12:00:00Z', canPost: false, isPaused: true, unreadCount: 0, avatarPath: 'room/avatar.jpg' }] });
    expect((await new LiveMeetupService().listChats())[0]?.avatarUrl).toBeUndefined();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('never signs an unapproved attachment, even if a raw path is present', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { items: [{ ...pending, media: { ...pending.media, storagePath: 'quarantine/secret.jpg' } }], nextCursor: null } });
    const messages = await new LiveMeetupService().listRoomMessages(roomId);
    expect(messages.items[0]?.media).toEqual({ kind: 'photo', status: 'pending' });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('signs approved attachments and sender avatars with short expiry', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { items: [{ ...pending, sender: { ...pending.sender, avatarPath: 'member/avatar.jpg' }, media: { kind: 'photo', status: 'approved', storagePath: 'room/photo.jpg' } }], nextCursor: null } });
    const message = (await new LiveMeetupService().listRoomMessages(roomId)).items[0]!;
    expect(message.sender?.avatarUrl).toBe('https://storage.test/member/avatar.jpg');
    expect(message.media).toEqual({ kind: 'photo', status: 'approved', url: 'https://storage.test/room/photo.jpg' });
    expect(mocks.sign).toHaveBeenCalledWith(['room/photo.jpg'], 60);
  });

  it('suppresses denied Storage responses instead of showing their URL', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { items: [{ ...pending, media: { kind: 'photo', status: 'approved', storagePath: 'room/photo.jpg' } }], nextCursor: null } });
    mocks.sign.mockResolvedValue({ error: null, data: [{ path: 'room/photo.jpg', signedUrl: 'https://storage.test/denied', error: 'denied' }] });
    expect((await new LiveMeetupService().listRoomMessages(roomId)).items[0]?.media?.url).toBeUndefined();
  });

  it('reuses the uploaded attachment when a send receipt is lost', async () => {
    const service = new LiveMeetupService();
    const failure = new Error('network timeout');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: failure }).mockResolvedValueOnce({ data: pending, error: null });
    await expect(service.sendRoomMedia(roomId, 'file:///photo.jpg', 'photo', 'image/jpeg', '', messageId)).rejects.toBe(failure);
    expect(await service.sendRoomMedia(roomId, 'file:///photo.jpg', 'photo', 'image/jpeg', '', messageId)).toEqual(pending);
    expect(mocks.queue).toHaveBeenCalledTimes(1);
    expect(mocks.queue).toHaveBeenCalledWith('meetup_room_message', roomId, 'file:///photo.jpg', 'image', 'image/jpeg', [], messageId);
    expect(mocks.rpc).toHaveBeenLastCalledWith('send_meetup_room_media_once', { room_id: roomId, message_id: messageId, upload_id: 'upload-id', body: '' });
  });

  it('does not reuse an upload for an edited retry', async () => {
    const service = new LiveMeetupService();
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('network timeout') });
    await expect(service.sendRoomMedia(roomId, 'file:///photo.jpg', 'photo', 'image/jpeg', 'caption', messageId)).rejects.toThrow();
    await expect(service.sendRoomMedia(roomId, 'file:///other.jpg', 'photo', 'image/jpeg', 'caption', messageId)).rejects.toThrow('message_id_conflict');
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });
  it('serializes concurrent uploads with the same send ID before their upload receipt arrives', async () => {
    let resolveUpload!: (id: string) => void;
    mocks.queue.mockReturnValue(new Promise<string>(resolve => { resolveUpload = resolve; }));
    mocks.rpc.mockResolvedValue({ data: pending, error: null });
    const service = new LiveMeetupService();
    const first = service.sendRoomMedia(roomId, 'file:///photo.jpg', 'photo', 'image/jpeg', '', messageId);
    const second = service.sendRoomMedia(roomId, 'file:///photo.jpg', 'photo', 'image/jpeg', '', messageId);
    await expect(service.sendRoomMedia(roomId, 'file:///other.jpg', 'photo', 'image/jpeg', '', messageId)).rejects.toThrow('message_id_conflict');
    resolveUpload('upload-id');
    expect(await Promise.all([first, second])).toEqual([pending, pending]);
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });

  it('propagates revoked member access before signing any pictures', async () => {
    const denied = { code: '42501', message: 'active_room_membership_required' };
    mocks.rpc.mockResolvedValue({ error: denied, data: null });
    await expect(new LiveMeetupService().listRoomMembers(roomId)).rejects.toBe(denied);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('queues host pictures through approval and removes them through the secured RPC', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    const service = new LiveMeetupService();
    await service.uploadRoomAvatar(roomId, 'file:///chat.jpg', 'image/jpeg');
    await service.removeRoomAvatar(roomId);
    expect(mocks.queue).toHaveBeenCalledWith('meetup_room_avatar', roomId, 'file:///chat.jpg', 'image', 'image/jpeg');
    expect(mocks.rpc).toHaveBeenCalledWith('remove_meetup_room_avatar', { room_id: roomId });
  });
});
