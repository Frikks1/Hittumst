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
const row={id:'stable-id',conversation_id:'chat',sender_id:'me',body:'Hello',image_path:null,message_kind:'text',album_share_id:null,album_item_id:null,created_at:'2026-09-07T12:00:00Z',deleted_at:null};
function chain(result:unknown){const query:any={};for(const method of ['insert','select','eq','update','lt'])query[method]=vi.fn(()=>query);query.single=vi.fn(async()=>result);return query;}
beforeEach(()=>{vi.clearAllMocks();mock.getUser.mockResolvedValue({data:{user:{id:'me'}},error:null});});
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

describe('live sponsorship transport and pool contracts', () => {
  const meetupId = 'c38df8a4-f792-4aa7-aec7-093140d54a04';
  const requestId = '00000000-0000-4000-8000-000000000001';
  const retryId = '00000000-0000-4000-8000-000000000002';
  const pendingKey = 'hittumst:pending-finance:me';
  const sponsorship = { quoteId: 'confirmed-quote', amount: 500, expectedHostBps: 2500, requestId };
  const emptyPool: MeetupPoolSummary = {
    hostBps: 2500, locked: false, total: 0, fundedTotal: 0, paidTotal: 0,
    refundedTotal: 0, status: 'accepting', estimatedParticipantReward: 0, eligibleParticipantCount: 2,
  };
  const summary = {
    id: meetupId, title: 'Community meetup', category: 'coffee_food', tags: [],
    startsAt: '2026-10-01T12:00:00Z', effectiveEnd: '2026-10-02T00:00:00Z',
    generalAreaId: 'reykjavik',
    generalArea: { id: 'reykjavik', labelIs: 'Reykjavík', labelEn: 'Reykjavik', region: 'capital' },
    host: { id: 'me', displayName: 'Member' }, accessMode: 'private',
    locationVisibility: 'protected', releasePolicy: '24_hours_before',
    participantCount: 2, capacity: null, isFull: false, isExplicit: false, status: 'published',
    location: { state: 'protected_locked', generalAreaId: 'reykjavik',
      marker: { latitude: 64.15, longitude: -21.94, isApproximate: true }, releaseAt: '2026-09-30T12:00:00Z' },
    viewerState: { participationStatus: 'none', hasProtectedLocationAccess: false },
    capabilities: { canViewExactLocation: false, canViewArrivalInstructions: false, canJoin: false,
      canRequestAccess: true, canCancelRequest: false, canLeave: false, canEdit: false,
      canManageRequests: false, canRemoveParticipants: false, canCancel: false, canDeleteDraft: false,
      canReport: true, canBlockHost: true },
  };
  const detail = { ...summary, description: 'A welcoming community gathering.', pool: { ...emptyPool, total: 500, fundedTotal: 500, estimatedParticipantReward: 187 } };
  const fetchMock = vi.fn();
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  beforeEach(() => {
    mock.storage.clear();
    mock.getSession.mockResolvedValue({ data: { session: { access_token: 'verified-session-token' } } });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    mock.rpc.mockResolvedValue({ data: detail, error: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists the confirmed quote before sending an atomic sponsored publication', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const payload = JSON.parse(init.body).payload;
      expect(JSON.parse(mock.storage.get(pendingKey)!)).toEqual(payload);
      expect(payload).toEqual({ action: 'publish_sponsored', meetupId, ...sponsorship });
      return response({ contributionId: 'funding-receipt' });
    });
    const api = new LiveRummalApi();
    expect((await api.publishMeetup(meetupId, sponsorship)).pool?.total).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith('https://commerce.test/api/commerce', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer verified-session-token', 'Content-Type': 'application/json' },
    }));
    expect(mock.storeWrite).toHaveBeenCalledTimes(1);
    expect(await api.getPendingFinanceCommand()).toBeNull();
    expect(mock.rpc.mock.calls).toEqual([['get_meetup', { meetup_id: meetupId }]]);
  });

  it('keeps the original publication request through a lost acknowledgement and a new adapter instance', async () => {
    fetchMock.mockRejectedValueOnce(new Error('acknowledgement lost')).mockResolvedValueOnce(response({ contributionId: 'funding-receipt' }));
    const api = new LiveRummalApi();
    await expect(api.publishMeetup(meetupId, sponsorship)).rejects.toThrow('acknowledgement lost');
    expect(await api.getPendingFinanceCommand()).toEqual({ action: 'publish_sponsored', meetupId, ...sponsorship });
    expect(mock.rpc).not.toHaveBeenCalled();
    const restarted = new LiveRummalApi();
    await restarted.publishMeetup(meetupId, { ...sponsorship, requestId: retryId });
    const payloads = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).payload);
    expect(payloads).toEqual(Array(2).fill({ action: 'publish_sponsored', meetupId, ...sponsorship }));
    expect(await restarted.getPendingFinanceCommand()).toBeNull();
  });

  it('preserves a definitive 422 business code, clears pending funding and permits a corrected quote', async () => {
    fetchMock.mockResolvedValueOnce(response({ code: 'quote_changed' }, 422)).mockResolvedValueOnce(response({ contributionId: 'corrected-receipt' }));
    const api = new LiveRummalApi();
    const failed = api.publishMeetup(meetupId, sponsorship);
    await expect(failed).rejects.toBeInstanceOf(FinancialCommandRejected);
    await expect(failed).rejects.toThrow('quote_changed');
    expect(await api.getPendingFinanceCommand()).toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
    const corrected = { ...sponsorship, quoteId: 'new-confirmed-quote', requestId: retryId, amount: 1000 };
    await api.publishMeetup(meetupId, corrected);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).payload).toEqual({ action: 'publish_sponsored', meetupId, ...corrected });
  });

  it('requests a source-specific quote without creating a pending financial mutation', async () => {
    fetchMock.mockResolvedValue(response({ id: 'quote', creditAmount: 500, cashAmount: 500, serviceFee: 50, processingFee: 0, totalCash: 550 }));
    const command = { action: 'contribution_quote' as const, meetupId, amount: 1000, fundingSource: 'mixed' as const, creditAmount: 500, requestId };
    await new LiveRummalApi().walletCommand(command);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ action: 'command', payload: command });
    expect(mock.storeWrite).not.toHaveBeenCalled();
    expect(mock.storage.size).toBe(0);
  });

  it.each([
    ['legacy absence', undefined],
    ['confirmed zero', emptyPool],
    ['historical paid total and disclosed split', { ...emptyPool, hostBps: 2000, locked: true, status: 'paid_out', fundedTotal: 10000, paidTotal: 10000, estimatedParticipantReward: null }],
  ] as const)('preserves %s in discovery and detail without a finance request per event', async (_case, pool) => {
    const wireSummary = { ...summary, ...(pool === undefined ? {} : { pool }) };
    mock.rpc.mockResolvedValueOnce({ data: [wireSummary], error: null })
      .mockResolvedValueOnce({ data: { ...wireSummary, description: detail.description }, error: null });
    const api = new LiveRummalApi();
    const cards = await api.discoverMeetups(defaultMeetupFilters);
    const event = await api.getMeetup(meetupId);
    expect(cards[0]?.pool).toEqual(pool);
    expect(event.pool).toEqual(pool);
    if (pool === undefined) { expect(cards[0]).not.toHaveProperty('pool'); expect(event).not.toHaveProperty('pool'); }
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(['discover_hittingar', 'get_meetup']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
