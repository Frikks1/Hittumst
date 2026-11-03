import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showcaseSchema, showcaseSaveInput, type ShowcaseAudience, type ShowcaseAudienceScope } from '@rummal/shared';
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrls: mocks.sign }) } } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { LiveShowcaseApi, type ShowcaseTransport } from './showcaseLive';
const sid = '10000000-0000-4000-8000-000000000001';
const eid = '10000000-0000-4000-8000-000000000002';
const mid = '10000000-0000-4000-8000-000000000003';
const owner = '10000000-0000-4000-8000-000000000004';
const showcase = () => showcaseSchema.parse({ id: sid, ownerId: owner, template: 'creations', title: 'What I make', audience: 'everyone', status: 'published', revision: 2, entries: [{ id: eid, kind: 'story', title: 'Sketchbook', body: 'A drawing a day.', approvalStatus: 'approved', media: [{ id: mid, kind: 'photo', bucket: 'showcase-media', storagePath: `${sid}/${mid}.jpg`, url: 'https://rpc.test/untrusted', caption: 'My drawing' }] }] });
const transport = (): ShowcaseTransport => ({ sign: vi.fn(async media => media), read: vi.fn(async () => new ArrayBuffer(12)), upload: vi.fn(async () => {}) });
beforeEach(() => mocks.sign.mockReset());
describe('live showcases', () => {
  it('uses scoped storage signing, strips RPC URLs and retains text on per-object denial', async () => {
    const rpc = vi.fn(async () => ({ ...showcase(), exactLocation: 'private' }));
    mocks.sign.mockResolvedValue({ data: [{ path: `${sid}/${mid}.jpg`, signedUrl: 'https://storage.test/denied', error: 'denied' }], error: null });
    const result = await new LiveShowcaseApi(rpc).get(sid);
    expect(result).not.toHaveProperty('exactLocation'); expect(result.entries[0]?.body).toBe('A drawing a day.');
    expect(result.entries[0]?.media[0]?.url).toBeUndefined();
    expect(mocks.sign).toHaveBeenCalledWith([`${sid}/${mid}.jpg`], 300);
  });
  it('never signs queued or rejected media paths', async () => {
    const data = showcase(); data.entries[0]!.media[0]!.status = 'pending';
    const result = await new LiveShowcaseApi(async () => data).get(sid);
    expect(result.entries[0]?.media[0]?.url).toBeUndefined(); expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('validates live identifiers and rejects mismatched or unpublished profile results', async () => {
    const rpc = vi.fn(async () => ({ ...showcase(), id: mid }));
    await expect(new LiveShowcaseApi(rpc, transport()).get(sid)).rejects.toThrow('invalid_showcase_response');
    await expect(new LiveShowcaseApi(rpc, transport()).get('demo')).rejects.toThrow();
    await expect(new LiveShowcaseApi(async () => [{ ...showcase(), status: 'draft' }], transport()).listProfile(owner)).rejects.toThrow('invalid_showcase_response');
  });
  it('sends revision guarded draft fields and explicitly selected publication audience', async () => {
    const rpc = vi.fn(async () => showcase()); const api = new LiveShowcaseApi(rpc, transport());
    const input = showcaseSaveInput(showcase()); await api.save(input); await api.publish(sid, 'friends', 2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'showcase_save', expect.objectContaining({ p_id: sid, p_expected_revision: 2, p_entries: input.entries, p_cover_media_id: null }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'showcase_publish', { p_id: sid, p_audience: 'friends', p_expected_revision: 2, p_group_id: null, p_person_ids: [] });
    await expect(api.publish(sid, null as never, 2)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('checks media before reservation and cancels an upload without hiding the original error', async () => {
    const rpc = vi.fn(async () => ({ id: mid, bucket: 'media-quarantine', path: 'quarantine/path' })); const media = transport(); const api = new LiveShowcaseApi(rpc, media);
    await expect(api.upload(sid, eid, 'file://media', 'photo', 'text/html', '')).rejects.toThrow('invalid_media_type'); expect(rpc).not.toHaveBeenCalled();
    vi.mocked(media.upload).mockRejectedValueOnce(new Error('upload_failed'));
    await expect(api.upload(sid, eid, 'file://media', 'photo', 'image/jpeg', '  Our moment  ')).rejects.toThrow('upload_failed');
    expect(rpc).toHaveBeenNthCalledWith(1, 'showcase_reserve_media', { p_showcase_id: sid, p_entry_id: eid, p_kind: 'photo', p_caption: 'Our moment' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_media_upload', { upload_id: mid });
  });
  it('rejects duplicate reorder identifiers and oversized uploads before allocating media', async () => {
    const rpc = vi.fn(); const media = transport(); vi.mocked(media.read).mockResolvedValue(new ArrayBuffer(50 * 1024 * 1024 + 1)); const api = new LiveShowcaseApi(rpc, media);
    await expect(api.reorder([sid, sid])).rejects.toThrow('invalid_showcase_order');
    await expect(api.upload(sid, eid, 'file://media', 'video', 'video/mp4', '')).rejects.toThrow('invalid_media_size');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('parses real source-photo picker and approval previews with omitted nullable poster fields', async () => {
    const sourceId = '10000000-0000-4000-8000-000000000005';
    const sourcePhoto = { id: mid, sourceUploadId: sourceId, kind: 'photo', caption: 'Our outing', bucket: 'meetup-media', storagePath: `event/${sourceId}.jpg`, uploaderId: owner, meetupId: sid };
    const snapshot = { ...showcase().entries[0]!, media: [sourcePhoto] };
    const rpc = vi.fn(async (name: string) => name === 'showcase_pickers'
      ? { events: [], requirementEvents: [], friends: [], groups: [], media: [sourcePhoto] }
      : [{ id: mid, showcaseId: sid, entryId: eid, revision: 2, role: 'media', recipientId: owner, status: 'pending', audience: 'friends', showcaseTitle: 'What I make', entryTitle: 'Sketchbook', entryBody: 'A drawing a day.', snapshot, countOnly: false }]);
    mocks.sign.mockResolvedValue({ data: [{ path: sourcePhoto.storagePath, signedUrl: 'https://storage.test/approved' }], error: null });
    const api = new LiveShowcaseApi(rpc); const picked = await api.pickers(); const [approval] = await api.listApprovals();
    expect(picked.media[0]).toMatchObject({ sourceUploadId: sourceId, meetupId: sid, url: 'https://storage.test/approved' });
    expect(picked.media[0]).not.toHaveProperty('posterPath');
    expect(approval?.snapshot.media[0]).toMatchObject({ sourceUploadId: sourceId, url: 'https://storage.test/approved' });
    expect(mocks.sign).toHaveBeenCalledWith([sourcePhoto.storagePath], 300);
  });
  it('sends the exact selected group or people with publication requests', async () => {
    const groupId = '10000000-0000-4000-8000-000000000005';
    const personId = '10000000-0000-4000-8000-000000000006';
    const rpc = vi.fn(async () => showcase());
    const api = new LiveShowcaseApi(rpc, transport());
    await api.publish(sid, 'group', 2, { groupId });
    await api.publish(sid, 'people', 2, { personIds: [owner, personId] });
    expect(rpc).toHaveBeenNthCalledWith(1, 'showcase_publish', { p_id: sid, p_audience: 'group', p_expected_revision: 2, p_group_id: groupId, p_person_ids: [] });
    expect(rpc).toHaveBeenNthCalledWith(2, 'showcase_publish', { p_id: sid, p_audience: 'people', p_expected_revision: 2, p_group_id: null, p_person_ids: [owner, personId] });
  });

  it('rejects malformed or wrong audience scopes before any publication RPC', async () => {
    const groupId = '10000000-0000-4000-8000-000000000005';
    const invalid: Array<[ShowcaseAudience, ShowcaseAudienceScope]> = [
      ['group', {}],
      ['group', { personIds: [owner] }],
      ['group', { groupId, personIds: [owner] }],
      ['people', {}],
      ['people', { groupId }],
      ['people', { groupId, personIds: [owner] }],
      ['people', { personIds: [owner, owner] }],
      ['friends', { personIds: [owner] }],
      ['everyone', { groupId }],
      ['no_one', { personIds: [owner] }],
      ['group', { groupId: 'demo-group' }],
      ['people', { personIds: ['demo-person'] }],
    ];
    const rpc = vi.fn();
    const api = new LiveShowcaseApi(rpc, transport());
    for (const [audience, scope] of invalid) await expect(api.publish(sid, audience, 2, scope)).rejects.toThrow();
    await expect(api.publish(sid, 'people', 2, { personIds: [owner], unexpectedScope: true } as never)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requests verified shared meetup choices for a validated friend and retains scoped picker metadata', async () => {
    const groupId = '10000000-0000-4000-8000-000000000005';
    const personId = '10000000-0000-4000-8000-000000000006';
    const albumId = '10000000-0000-4000-8000-000000000007';
    const rpc = vi.fn(async () => ({ events: [], friends: [], groups: [{ id: groupId, name: 'Weekend friends', members: [{ id: owner, displayName: 'Me' }], memberVisible: false }], albums: [{ id: albumId, title: 'My private album' }], media: [] }));
    const api = new LiveShowcaseApi(rpc, transport());
    const ownChoices = await api.pickers();
    const sharedChoices = await api.pickers(personId);
    expect(rpc).toHaveBeenNthCalledWith(1, 'showcase_pickers', { p_person_id: null });
    expect(rpc).toHaveBeenNthCalledWith(2, 'showcase_pickers', { p_person_id: personId });
    expect(ownChoices.groups[0]).toMatchObject({ members: [{ id: owner, displayName: 'Me' }], memberVisible: false });
    expect(sharedChoices.albums).toEqual([{ id: albumId, title: 'My private album' }]);
    await expect(api.pickers('demo-person')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('sends selected album identifiers and roster choice without derived titles or members', async () => {
    const albumId = '10000000-0000-4000-8000-000000000007';
    const groupId = '10000000-0000-4000-8000-000000000005';
    const original = showcase();
    original.entries[0] = { ...original.entries[0]!, kind: 'group', groupId, albumIds: [albumId], albums: [{ id: albumId, title: 'My private album', shareId: mid }], showMembers: true, groupMembers: [{ id: owner, displayName: 'Me' }] };
    const rpc = vi.fn(async (_name: string, _parameters?: Record<string, unknown>) => showcase());
    await new LiveShowcaseApi(rpc, transport()).save(showcaseSaveInput(original));
    const parameters = rpc.mock.calls[0]?.[1] as { p_entries: Array<Record<string, unknown>> };
    expect(parameters.p_entries[0]).toMatchObject({ albumIds: [albumId], showMembers: true });
    expect(parameters.p_entries[0]).not.toHaveProperty('albums');
    expect(parameters.p_entries[0]).not.toHaveProperty('groupMembers');
  });

  it('validates live album and featured-person identifiers before saving a draft', async () => {
    const rpc = vi.fn();
    const api = new LiveShowcaseApi(rpc, transport());
    const input = showcaseSaveInput(showcase());
    await expect(api.save({ ...input, entries: [{ ...input.entries[0]!, albumIds: ['demo-album'] }] })).rejects.toThrow();
    await expect(api.save({ ...input, entries: [{ ...input.entries[0]!, kind: 'person', personId: 'demo-person' }] })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the member privacy RPC for opt-out and validates its inputs before a request', async () => {
    const groupId = '10000000-0000-4000-8000-000000000005';
    const rpc = vi.fn(async () => undefined);
    const api = new LiveShowcaseApi(rpc, transport());
    await api.setGroupMemberVisibility(groupId, false);
    await api.setGroupMemberVisibility(groupId, true);
    expect(rpc).toHaveBeenNthCalledWith(1, 'showcase_set_group_member_visibility', { p_group_id: groupId, p_visible: false });
    expect(rpc).toHaveBeenNthCalledWith(2, 'showcase_set_group_member_visibility', { p_group_id: groupId, p_visible: true });
    await expect(api.setGroupMemberVisibility('demo-group', false)).rejects.toThrow();
    await expect(api.setGroupMemberVisibility(groupId, 'false' as never)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('retains exact audience labels and authorized album routes from approved projections', async () => {
    const personId = '10000000-0000-4000-8000-000000000006';
    const albumId = '10000000-0000-4000-8000-000000000007';
    const value = { ...showcase(), audience: 'people', audiencePersonIds: [personId], audiencePeople: [{ id: personId, displayName: 'A chosen viewer' }] };
    value.entries[0]!.albums = [{ id: albumId, title: 'An authorized album', shareId: mid }];
    const result = await new LiveShowcaseApi(async () => value, transport()).get(sid);
    expect(result).toMatchObject({ audience: 'people', audiencePersonIds: [personId], audiencePeople: [{ id: personId, displayName: 'A chosen viewer' }], audienceGroupId: null });
    expect(result.entries[0]?.albums).toEqual([{ id: albumId, title: 'An authorized album', shareId: mid }]);
  });

});
