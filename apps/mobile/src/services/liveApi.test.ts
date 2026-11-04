import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),channel:vi.fn(),removeChannel:vi.fn(),getUser:vi.fn(),storageFrom:vi.fn(),signedUrls:vi.fn(),getSession:vi.fn(),storage:new Map<string,string>(),storeWrite:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mock.from,rpc:mock.rpc,channel:mock.channel,removeChannel:mock.removeChannel,auth:{getUser:mock.getUser,getSession:mock.getSession},storage:{from:mock.storageFrom}}}));
vi.mock('./env',()=>({runtimeEnv:{websiteUrl:'https://commerce.test'}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:async(key:string)=>mock.storage.get(key)??null,setItem:async(key:string,value:string)=>{mock.storeWrite(key,value);mock.storage.set(key,value);},removeItem:async(key:string)=>{mock.storage.delete(key);}}}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'new-id'}));
vi.mock('expo-image-manipulator',()=>({manipulateAsync:vi.fn(),SaveFormat:{JPEG:'jpeg'}}));
import { LiveRummalApi } from './liveApi';
import { defaultMeetupFilters, type MeetupPoolSummary } from '@rummal/shared';
import { FinancialCommandRejected } from './financialOutbox';
import { defaultProfileAppearance } from '@/utils/profileAppearance';
import { defaultNotificationPreferences } from './notificationPreferences';
const row={id:'stable-id',conversation_id:'chat',sender_id:'me',body:'Hello',image_path:null,message_kind:'text',album_share_id:null,album_item_id:null,created_at:'2026-09-07T12:00:00Z',deleted_at:null};
function chain(result:unknown){const query:any={};for(const method of ['insert','select','eq','update','lt'])query[method]=vi.fn(()=>query);query.single=vi.fn(async()=>result);return query;}
beforeEach(()=>{vi.clearAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:'me'}},error:null});});

describe('notification preference API', () => {
  it('reads preferences through the caller-only RPC', async () => {
    mock.rpc.mockResolvedValue({ data: { ...defaultNotificationPreferences, mutedConversationIds: ['chat'] }, error: null });
    expect(await new LiveRummalApi().getNotificationPreferences()).toMatchObject({ messages: true, mutedConversationIds: ['chat'] });
    expect(mock.rpc).toHaveBeenCalledWith('get_notification_preferences');
  });
  it('writes a partial update without an account selector', async () => {
    mock.rpc.mockResolvedValue({ data: { ...defaultNotificationPreferences, events: false }, error: null });
    expect((await new LiveRummalApi().updateNotificationPreferences({ events: false })).events).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith('update_notification_preferences', { preferences: { events: false } });
  });
  it('rejects malformed time and forged owner before any network write', async () => {
    const api = new LiveRummalApi();
    await expect(api.updateNotificationPreferences({ quietHoursStart: '24:00' })).rejects.toThrow();
    await expect(api.updateNotificationPreferences({ profileId: 'other' } as never)).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('uses the guarded mute endpoint and propagates revocation', async () => {
    mock.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('conversation_unavailable') });
    const api = new LiveRummalApi();
    await api.setConversationMuted('chat', true);
    expect(mock.rpc).toHaveBeenCalledWith('set_conversation_muted', { conversation_id: 'chat', muted: true });
    await expect(api.setConversationMuted('removed-chat', false)).rejects.toThrow('conversation_unavailable');
  });
  it('fails visibly when the server errors or returns malformed preferences', async () => {
    mock.rpc.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValueOnce({ data: { messages: true }, error: null });
    const api = new LiveRummalApi();
    await expect(api.getNotificationPreferences()).rejects.toThrow('offline');
    await expect(api.getNotificationPreferences()).rejects.toThrow();
  });
});

describe('live profile editor contract', () => {
  it('writes entered profile fields and music links without writing age or account identifiers', async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mock.from.mockReturnValue(query);
    const api = new LiveRummalApi();
    vi.spyOn(api, 'getOwnProfile').mockResolvedValue({ displayName: 'Alex' } as Awaited<ReturnType<LiveRummalApi['getOwnProfile']>>);
    await api.updateProfile({ id: 'forged', age: 19, dateOfBirth: '2007-01-01', photos: [],
      displayName: ' Alex ', pronouns: 'they/them', gender: 'nonbinary', bio: 'Music and coffee',
      identity: ['queer'], interests: ['Music', 'Coffee'], lookingFor: ['chat', 'friends'],
      socials: [{ platform: 'spotify', handle: 'alex' }, { platform: 'soundcloud', handle: 'alex-synth' }] });
    expect(query.update).toHaveBeenCalledWith({ display_name: 'Alex', pronouns: 'they/them', gender: 'nonbinary',
      bio: 'Music and coffee', identity_tags: ['queer'], interests: ['Music', 'Coffee'], looking_for: ['chat', 'friends'],
      socials: [{ platform: 'spotify', handle: 'alex' }, { platform: 'soundcloud', handle: 'alex-synth' }] });
    expect(query.eq).toHaveBeenCalledWith('id', 'me');
  });
  it('rejects an invalid edit before authentication or the profile query', async () => {
    await expect(new LiveRummalApi().updateProfile({ displayName: 'Changed', interests: ['x'.repeat(81)] })).rejects.toThrow('invalid_profile_interests');
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('removes only the authenticated owner photo and requires a confirmed deletion', async () => {
    const query = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [{ id: 'photo' }], error: null }) };
    mock.from.mockReturnValue(query);
    const api = new LiveRummalApi();
    await api.removeProfilePhoto('photo');
    expect(mock.from).toHaveBeenCalledWith('profile_photos');
    expect(query.eq.mock.calls).toEqual([['id', 'photo'], ['profile_id', 'me']]);
    query.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(api.removeProfilePhoto('not-owned')).rejects.toThrow('profile_photo_unavailable');
    query.select.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(api.removeProfilePhoto('photo')).rejects.toThrow('offline');
  });
  it('preserves music socials returned by the public profile RPC', async () => {
    mock.rpc.mockResolvedValue({ data: { id: 'other', display_name: 'Member', age: 28,
      socials: [{ platform: 'spotify', handle: 'alex' }, { platform: 'soundcloud', handle: 'alex-synth' }], photo_paths: [] }, error: null });
    expect((await new LiveRummalApi().getProfile('other')).socials).toEqual([
      { platform: 'spotify', handle: 'alex' }, { platform: 'soundcloud', handle: 'alex-synth' },
    ]);
  });
});
describe('live profile appearance', () => {
  const appearance = { palette: 'fern', banner: 'aurora', effect: 'fireflies', avatarBorder: 'ferns' } as const;
  it('writes a validated catalog choice using the existing owner update', async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mock.from.mockReturnValue(query);
    const api = new LiveRummalApi();
    vi.spyOn(api, 'getOwnProfile').mockResolvedValue({ appearance } as Awaited<ReturnType<LiveRummalApi['getOwnProfile']>>);
    expect((await api.updateProfile({ appearance })).appearance).toEqual(appearance);
    expect(query.update).toHaveBeenCalledWith({ profile_appearance: appearance });
    expect(query.eq).toHaveBeenCalledWith('id', 'me');
  });
  it('rejects unsupported appearance before contacting the backend', async () => {
    const api = new LiveRummalApi();
    await expect(api.updateProfile({ appearance: { ...appearance, banner: 'external' } as unknown as typeof appearance })).rejects.toThrow('invalid_profile_appearance');
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it('normalizes public RPC appearance and signs GIF first frames along with approved photos', async () => {
    mock.rpc.mockResolvedValue({ data: { id: 'other', display_name: 'Member', age: 28, profile_appearance: appearance, photo_paths: [{ id: 'photo', path: 'other/photo.gif' }] }, error: null });
    mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls });
    mock.signedUrls.mockResolvedValue({ data: [{ path: 'other/photo.gif', signedUrl: 'https://private.test/photo.gif' }, { path: 'other/photo-thumb.jpg', signedUrl: 'https://private.test/poster.jpg' }], error: null });
    const profile = await new LiveRummalApi().getProfile('other');
    expect(profile.appearance).toEqual(appearance);
    expect(profile.photos[0]).toMatchObject({ url: 'https://private.test/photo.gif', posterUrl: 'https://private.test/poster.jpg' });
    expect(mock.signedUrls).toHaveBeenCalledWith(['other/photo.gif', 'other/photo-thumb.jpg'], 300);
  });
  it('defaults profiles returned by an older server', async () => {
    mock.rpc.mockResolvedValue({ data: { id: 'other', display_name: 'Member', age: 28, photo_paths: [] }, error: null });
    expect((await new LiveRummalApi().getProfile('other')).appearance).toEqual(defaultProfileAppearance);
  });
  it('signs only the current cover even when an older payload includes legacy extras and videos', async () => {
    mock.rpc.mockResolvedValue({ data: { id: 'other', display_name: 'Member', age: 28, cover_photo_id: 'cover',
      photo_paths: [{ id: 'extra', path: 'other/extra.jpg' }, { id: 'cover', path: 'other/main.jpg' },
        { id: 'archived', path: 'other/archive.gif', archived_at: '2026-10-14T00:00:00Z' }],
      videos: ['https://unwanted.test/video'], profile_videos: [{ id: 'video', path: 'other/video.mp4' }] }, error: null });
    mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls });
    mock.signedUrls.mockResolvedValue({ data: [{ path: 'other/main.jpg', signedUrl: 'https://private.test/main' }], error: null });
    const profile = await new LiveRummalApi().getProfile('other');
    expect(profile.photos).toEqual([expect.objectContaining({ id: 'cover', url: 'https://private.test/main' })]);
    expect(profile.profileVideos).toEqual([]);
    expect(profile.videos).toEqual([]);
    expect(mock.storageFrom).toHaveBeenCalledTimes(1);
    expect(mock.storageFrom).toHaveBeenCalledWith('profile-photos');
    expect(mock.signedUrls).toHaveBeenCalledWith(['other/main.jpg'], 300);
  });
  it('keeps archives owner-only and exposes a staged replacement without changing the current picture', async () => {
    const profile = { id: 'me', display_name: 'Member', date_of_birth: '1990-01-01', identity_tags: [], looking_for: [], profile_tags: [], videos: [], custom_tags: [], interests: [], socials: [], cover_photo_id: 'main' };
    mock.from.mockImplementation(table => table === 'profiles' ? chain({ data: profile, error: null })
      : { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: table === 'profile_photos'
        ? [{ id: 'main', storage_path: 'me/main.jpg', approval_status: 'approved', position: 1, tags: [], archived_at: null },
          { id: 'archived', storage_path: 'me/archive.jpg', approval_status: 'approved', position: 2, tags: [], archived_at: '2026-10-14T00:00:00Z' }] : [], error: null }) });
    mock.rpc.mockResolvedValue({ data: { id: 'replacement', status: 'pending', reason: null }, error: null });
    mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls });
    mock.signedUrls.mockResolvedValue({ data: [{ path: 'me/main.jpg', signedUrl: 'https://private.test/main' }, { path: 'me/archive.jpg', signedUrl: 'https://private.test/archive' }], error: null });
    const own = await new LiveRummalApi().getOwnProfile();
    expect(own.mainPhotoUpload).toEqual({ id: 'replacement', status: 'pending', reason: null });
    expect(own.photos.find(photo => photo.id === 'archived')?.archivedAt).toBe('2026-10-14T00:00:00Z');
    expect(mock.rpc).toHaveBeenCalledWith('get_main_profile_photo_upload');
  });
  it('maps the owner appearance with a reduced-motion GIF poster', async () => {
    const profile = { id: 'me', display_name: 'Member', date_of_birth: '1990-01-01', identity_tags: [], looking_for: [], profile_tags: [], videos: [], custom_tags: [], interests: [], socials: [], profile_appearance: appearance };
    mock.from.mockImplementation(table => table === 'profiles'
      ? chain({ data: profile, error: null })
      : { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: table === 'profile_photos' ? [{ id: 'photo', storage_path: 'me/photo.gif', approval_status: 'approved', tags: [] }] : [], error: null }) });
    mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls });
    mock.signedUrls.mockResolvedValue({ data: [{ path: 'me/photo.gif', signedUrl: 'https://private.test/photo.gif' }, { path: 'me/photo-thumb.jpg', signedUrl: 'https://private.test/poster.jpg' }], error: null });
    expect(await new LiveRummalApi().getOwnProfile()).toMatchObject({ appearance, photos: [{ posterUrl: 'https://private.test/poster.jpg' }] });
  });
});
describe('live text delivery',()=>{
  it('reuses the caller message identifier in its insert',async()=>{
    const query=chain({data:row,error:null});mock.from.mockReturnValue(query);
    const result=await new LiveRummalApi().sendText('chat',' Hello ','stable-id');
    expect(query.insert).toHaveBeenCalledWith({id:'stable-id',conversation_id:'chat',sender_id:'me',body:'Hello'});
    expect(result.status).toBe('sent');
  });
  it('recovers a confirmed insert after the first acknowledgement was lost',async()=>{
    const insert=chain({data:null,error:{code:'23505'}}),read=chain({data:row,error:null});mock.from.mockReturnValueOnce(insert).mockReturnValueOnce(read);
    const result=await new LiveRummalApi().sendText('chat','Hello','stable-id');
    expect(result.id).toBe('stable-id');expect(read.eq.mock.calls).toEqual([['id','stable-id'],['conversation_id','chat'],['sender_id','me']]);
  });
  it('never treats a reused identifier with different text as a success',async()=>{
    mock.from.mockReturnValueOnce(chain({data:null,error:{code:'23505'}})).mockReturnValueOnce(chain({data:{...row,body:'Other text'},error:null}));
    await expect(new LiveRummalApi().sendText('chat','Hello','stable-id')).rejects.toMatchObject({code:'23505'});
  });
  it('rejects an invalid message before contacting the backend',async()=>{
    await expect(new LiveRummalApi().sendText('chat',' '.repeat(8))).rejects.toThrow('invalid_message_body');expect(mock.from).not.toHaveBeenCalled();
  });
});

describe('profile interest API contract', () => {
  it('records explicit views and taps using the guarded RPCs', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    const api = new LiveRummalApi();
    await api.recordProfileView('other');
    await api.sendProfileTap('other');
    expect(mock.rpc.mock.calls).toEqual([
      ['record_profile_view', { profile_id: 'other' }],
      ['send_profile_tap', { profile_id: 'other' }],
    ]);
  });
  it('propagates cooldown and authorization errors for the tap action', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('tap_cooldown') });
    await expect(new LiveRummalApi().sendProfileTap('other')).rejects.toThrow('tap_cooldown');
  });
  it('maps inbox profiles with one signed media request per bucket and stable cursors', async () => {
    const cursor = { at: '2026-09-30T12:00:00Z', id: 'activity-id' };
    const profile = { id: 'other', display_name: 'Member', age: 28, photo_paths: [{ id: 'photo', path: 'other/photo.jpg', tags: [] }] };
    mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls });
    mock.signedUrls.mockResolvedValue({ data: [{ path: 'other/photo.jpg', signedUrl: 'https://private.test/photo' }], error: null });
    mock.rpc.mockResolvedValue({ data: { items: [{ id: 'activity-id', profile, occurredAt: cursor.at, count: 3 }], nextCursor: cursor }, error: null });
    const api = new LiveRummalApi();
    const page = await api.listProfileActivity('views', JSON.stringify(cursor));
    expect(mock.rpc).toHaveBeenCalledWith('list_profile_activity', { kind: 'views', cursor, page_size: 40 });
    expect(page.nextCursor).toBe(JSON.stringify(cursor));
    expect(page.items[0]).toMatchObject({ id: 'activity-id', count: 3, profile: { id: 'other', photos: [{ id: 'photo', url: 'https://private.test/photo' }] } });
    expect(mock.signedUrls).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not request a page or sign media for a malformed cursor', async () => {
    await expect(new LiveRummalApi().listProfileActivity('taps', '{"at":"invalid","id":"id"}')).rejects.toThrow('invalid_cursor');
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.signedUrls).not.toHaveBeenCalled();
  });
});


describe('atomic live onboarding API contract', () => {
  const payload = { dateOfBirth: '1990-01-01', displayName: 'Member', identity: ['queer' as const], lookingFor: ['friends' as const], bio: '', region: 'capital' as const, sensitiveDataConsent: true, privacyAccepted: true, termsAccepted: true, guidelinesAccepted: true, locale: 'en' as const, videos: ['https://example.test/video'], socials: [], interests: ['Hiking'] };
  it('commits registration, explicit policy consent and customization in one unambiguous RPC', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    const api = new LiveRummalApi(); const update = vi.spyOn(api, 'updateProfile');
    await api.completeOnboarding(payload);
    expect(mock.rpc).toHaveBeenCalledWith('complete_onboarding_profile', { input: { ...payload, region: 'hofudborgarsvaedid' } });
    expect(mock.rpc).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled();
  });
  it('propagates rejected registration without a second write', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('onboarding_rejected') });
    const api = new LiveRummalApi(); const update = vi.spyOn(api, 'updateProfile');
    await expect(api.completeOnboarding(payload)).rejects.toThrow('onboarding_rejected'); expect(update).not.toHaveBeenCalled();
  });
  it('retries the same complete request after a lost network acknowledgement', async () => {
    mock.rpc.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: null, error: null });
    const api = new LiveRummalApi();
    await expect(api.completeOnboarding(payload)).rejects.toThrow('offline');
    await expect(api.completeOnboarding(payload)).resolves.toBeUndefined();
    expect(mock.rpc.mock.calls[1]).toEqual(mock.rpc.mock.calls[0]);
  });
  it.each(['not_applicable', 'prefer_not_to_say'] as const)('commits the sole privacy answer %s', async identity => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await new LiveRummalApi().completeOnboarding({ ...payload, identity: [identity] });
    expect(mock.rpc).toHaveBeenCalledWith('complete_onboarding_profile', { input: { ...payload, identity: [identity], region: 'hofudborgarsvaedid' } });
  });
  it('rejects mixed privacy answers before either registration or profile update contacts the backend', async () => {
    const api = new LiveRummalApi();
    await expect(api.completeOnboarding({ ...payload, identity: ['gay', 'prefer_not_to_say'] })).rejects.toThrow('orientation_privacy_choice_exclusive');
    await expect(api.updateProfile({ identity: ['not_applicable', 'prefer_not_to_say'] })).rejects.toThrow('orientation_privacy_choice_exclusive');
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled(); expect(mock.getUser).not.toHaveBeenCalled();
  });
  it('stores a privacy answer during profile editing and still preserves older explicit tags', async () => {
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    mock.from.mockReturnValue(query);
    const api = new LiveRummalApi(); vi.spyOn(api, 'getOwnProfile').mockResolvedValue({} as Awaited<ReturnType<LiveRummalApi['getOwnProfile']>>);
    await api.updateProfile({ identity: ['prefer_not_to_say'] });
    expect(query.update).toHaveBeenLastCalledWith({ identity_tags: ['prefer_not_to_say'] });
    await api.updateProfile({ identity: ['trans_man'] as unknown as Parameters<LiveRummalApi['updateProfile']>[0]['identity'] });
    expect(query.update).toHaveBeenLastCalledWith({ identity_tags: ['trans_man'] });
  });
});

describe('group client delivery contract', () => {
  it('returns the server receipt without substituting another member message', async () => {
    const receipt = { id: 'sent-id', groupId: 'group-id', body: 'Hello', senderId: 'me', senderName: 'Member', createdAt: '2026-09-08T12:00:00Z' };
    mock.rpc.mockResolvedValue({ data: receipt, error: null });
    await expect(new LiveRummalApi().sendGroupMessage('group-id', ' Hello ', 'sent-id')).resolves.toEqual(receipt);
    expect(mock.rpc).toHaveBeenCalledWith('send_group_message_receipt', { group_id: 'group-id', body: 'Hello', client_message_id: 'sent-id' });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('passes stable history cursors and serializes returned cursor', async () => {
    const cursor = { createdAt: '2026-09-08T12:00:00Z', id: 'message-id' };
    mock.rpc.mockResolvedValue({ data: { items: [], nextCursor: cursor }, error: null });
    const page = await new LiveRummalApi().listGroupMessagePage('group-id', JSON.stringify(cursor));
    expect(mock.rpc).toHaveBeenCalledWith('list_group_messages_page', { group_id: 'group-id', cursor, page_size: 50 });
    expect(page.nextCursor).toBe(JSON.stringify(cursor));
  });
  it('requests catch-up on first subscription and every reconnect without callbacks after disposal', () => {
    let status: ((value: string) => void) | undefined;
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn((callback) => { status = callback; return channel; }) };
    mock.channel.mockReturnValue(channel);
    const catchup = vi.fn();
    const unsubscribe = new LiveRummalApi().subscribeMessages('chat', vi.fn(), catchup);
    status?.('SUBSCRIBED'); status?.('CHANNEL_ERROR'); status?.('SUBSCRIBED');
    expect(catchup).toHaveBeenCalledTimes(2);
    unsubscribe(); status?.('SUBSCRIBED'); expect(catchup).toHaveBeenCalledTimes(2);
  });
});


describe('album renewal and notification API contracts', () => {
  const receipt = { album_id: 'album', name: 'Private', content_version: 1, session_id: 'session', items: [{ id: 'image', storage_path: 'private/image.jpg', media_type: 'image', position: 1 }] };
  beforeEach(() => { mock.storageFrom.mockReturnValue({ createSignedUrls: mock.signedUrls }); mock.signedUrls.mockResolvedValue({ data: [{ path: 'private/image.jpg', signedUrl: 'https://private.test/signed' }], error: null }); });
  it('uses idempotent open and never calls it during URL renewal', async () => {
    mock.rpc.mockResolvedValue({ data: receipt, error: null }); const api = new LiveRummalApi();
    await api.openAlbumShare('share', 'request'); await api.refreshAlbumShare('share', 'session');
    expect(mock.rpc.mock.calls).toEqual([['open_album_share_once', { share_id: 'share', request_id: 'request' }], ['refresh_album_share', { share_id: 'share', session_id: 'session' }]]);
    expect(mock.signedUrls).toHaveBeenCalledWith(['private/image.jpg'], 60);
  });
  it('does not sign private media after authorization is revoked', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('album_share_locked') });
    await expect(new LiveRummalApi().refreshAlbumShare('share', 'session')).rejects.toThrow('album_share_locked');
    expect(mock.signedUrls).not.toHaveBeenCalled();
  });
  it('never returns partially signed media as a success', async () => {
    mock.rpc.mockResolvedValue({ data: receipt, error: null }); mock.signedUrls.mockResolvedValue({ data: [{ path: 'private/image.jpg', error: 'denied' }], error: null });
    await expect(new LiveRummalApi().refreshAlbumShare('share', 'session')).rejects.toThrow('album_media_unavailable');
  });
  it('rejects an expired share before signing URLs', async () => {
    mock.rpc.mockResolvedValue({ data: { ...receipt, access_expires_at: '2000-01-01T00:00:00Z' }, error: null });
    await expect(new LiveRummalApi().refreshAlbumShare('share', 'session')).rejects.toThrow('album_share_locked'); expect(mock.signedUrls).not.toHaveBeenCalled();
  });
  it('resolves a notification through the authorized typed endpoint', async () => {
    const target = { type: 'group', id: '10000000-0000-4000-8000-000000000001' }; mock.rpc.mockResolvedValue({ data: target, error: null });
    expect(await new LiveRummalApi().resolveNotification('notification')).toEqual(target);
    expect(mock.rpc).toHaveBeenCalledWith('resolve_notification', { notification_id: 'notification' });
  });
});


describe('feedback without excluded person ratings',()=>{
  function comments(result:unknown){
    const query={select:vi.fn(),eq:vi.fn(),order:vi.fn().mockResolvedValue(result)};
    query.select.mockReturnValue(query);query.eq.mockReturnValue(query);mock.from.mockReturnValue(query);return query;
  }
  it.each(['profile','photo','video'] as const)('loads allowed comments and reactions for %s while the rating RPC is revoked',async target=>{
    comments({data:[{id:'comment',target_type:target,target_id:'content',author_id:'author',profiles:{display_name:'Member'},body:'Hello',created_at:'2026-09-21T10:00:00Z',is_anonymous:false}],error:null});
    mock.rpc.mockImplementation(async name=>name==='list_content_rating_counts'?{data:null,error:new Error('permission denied')}:{data:[{emoji:'🔥',count:2,reacted_by_viewer:true}],error:null});
    const feedback=await new LiveRummalApi().listFeedback(target,'content');
    expect(feedback.ratings).toEqual([]);expect(feedback.comments[0]).toMatchObject({body:'Hello',authorName:'Member',authorId:'author'});
    expect(feedback.reactions).toEqual([{emoji:'🔥',count:2,reacted:true}]);
    expect(mock.rpc.mock.calls).toEqual([['list_content_reactions',{target_type:target,target_id:'content'}]]);
  });
  it('preserves permitted comment privacy and propagates an actual comment-read failure',async()=>{
    comments({data:[{id:'comment',target_type:'profile',target_id:'content',author_id:'private-author',profiles:{display_name:'Private name'},body:'Hello',created_at:'2026-09-21T10:00:00Z',is_anonymous:true}],error:null});
    mock.rpc.mockResolvedValue({data:[],error:null});
    const feedback=await new LiveRummalApi().listFeedback('profile','content');expect(feedback.comments[0]).toMatchObject({authorId:'anonymous',authorName:'Anonymous'});
    comments({data:null,error:new Error('comment_wall_unavailable')});
    await expect(new LiveRummalApi().listFeedback('profile','content')).rejects.toThrow('comment_wall_unavailable');
  });
  it('does not turn a failed reaction read into a falsely empty successful load',async()=>{
    comments({data:[],error:null});mock.rpc.mockResolvedValue({data:null,error:new Error('reactions_unavailable')});
    await expect(new LiveRummalApi().listFeedback('photo','content')).rejects.toThrow('reactions_unavailable');
  });
  it('saves allowed profile privacy without writing a legacy anonymous-rating preference',async()=>{
    const query={update:vi.fn(),eq:vi.fn().mockResolvedValue({error:null})};query.update.mockReturnValue(query);mock.from.mockReturnValue(query);
    const api=new LiveRummalApi();vi.spyOn(api,'getOwnProfile').mockResolvedValue({id:'me'} as never);
    await api.updateProfile({commentWallEnabled:false,anonymousRatingsEnabled:true,displayName:'Member'});
    expect(query.update).toHaveBeenCalledWith({comment_wall_enabled:false,display_name:'Member'});
  });
});

describe('retired money transport', () => {
 it('rejects payments without calling providers', async () => {
  const api = new LiveRummalApi();
  await expect(api.getWallet()).rejects.toThrow('money_features_removed');
  await expect(api.setSandboxTier('plebba_kongur')).rejects.toThrow('money_features_removed');
  await expect(api.walletCommand({ action: 'purchase', amount: 1000, requestId: crypto.randomUUID() })).rejects.toThrow('money_features_removed');
 });
});
