import { describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '@/types/domain';
import { MockRummalApi } from './mockApi';

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

describe('MockRummalApi albums and tags', () => {
  it('uses AND semantics for tag discovery', async () => {
    const api = new MockRummalApi();
    const gaming = await api.discover({ ...defaultFilters, tags: ['gaming'] });
    expect(gaming.items.map((profile) => profile.id)).toEqual(expect.arrayContaining(['p-elias', 'p-kari']));
    const gamingAndChill = await api.discover({ ...defaultFilters, tags: ['gaming', 'chill'] });
    expect(gamingAndChill.items.map((profile) => profile.id)).toEqual(['p-elias']);
  });

  it('shows no album media until a recipient accepts', async () => {
    const api = new MockRummalApi();
    const [share] = await api.listAlbumShares();
    expect(share?.status).toBe('pending');
    await expect(api.openAlbumShare(share!.id)).rejects.toThrow('album_share_locked');
    await api.respondToAlbumShare(share!.id, true);
    const viewer = await api.openAlbumShare(share!.id);
    expect(viewer.items).toHaveLength(1);
  });

  it('keeps an outgoing view-once share recipient-only', async () => {
    const api = new MockRummalApi();
    const album = await api.createAlbum('Private test');
    const { shareIds } = await api.shareAlbums('p-bjarni', [album.id], 'view_once');
    // The owner cannot open their outgoing share; this guards the recipient-only boundary.
    await expect(api.openAlbumShare(shareIds[0]!)).rejects.toThrow('album_share_locked');
  });

  it('shares to several eligible profiles in one action and caps recipients at five', async () => {
    const api = new MockRummalApi();
    const album = await api.createAlbum('Small circle');
    const result = await api.shareAlbums(['p-bjarni', 'p-elias'], [album.id], '1_hour');
    expect(Object.keys(result.conversationIds)).toEqual(['p-bjarni', 'p-elias']);
    expect(result.shareIds).toHaveLength(2);
    await expect(api.shareAlbums(['a', 'b', 'c', 'd', 'e', 'f'], [album.id], 'indefinite')).rejects.toThrow('invalid_recipient_selection');
  });

  it('persists friend requests and starred items in the social lists', async () => {
    const api = new MockRummalApi();
    await api.setFriendship('p-bjarni', 'request');
    expect(await api.listFriends()).toEqual([expect.objectContaining({ profileId: 'p-bjarni', status: 'pending', direction: 'outgoing' })]);
    expect(await api.toggleStarredItem('friend', 'p-bjarni', 'Bjarni', 'friends')).toBe(true);
    expect(await api.listStarredItems()).toEqual([expect.objectContaining({ targetType: 'friend', profileAudience: 'friends' })]);
    expect(await api.toggleStarredItem('friend', 'p-bjarni', 'Bjarni')).toBe(false);
    expect(await api.listStarredItems()).toEqual([]);
  });

  it('supports emoji counters and persistent group messages', async () => {
    const api = new MockRummalApi();
    await api.toggleContentReaction('profile', 'p-bjarni', '🔥');
    const feedback = await api.listFeedback('profile', 'p-bjarni');
    expect(feedback.reactions).toContainEqual({ emoji: '🔥', count: 1, reacted: true });
    const groupId = await api.createGroup('Night owls', 'Late chats');
    const message = await api.sendGroupMessage(groupId, 'Hello group');
    expect(await api.listGroupMessages(groupId)).toEqual([message]);
    expect((await api.startGroupVoice(groupId)).participantCount).toBe(1);
  });
});

describe('mock chat retry parity',()=>{
  it('keeps a stable message id across retries and rejects conflicting payloads',async()=>{
    const api=new MockRummalApi();
    const before=await api.listMessages('c-bjarni');
    const first=await api.sendText('c-bjarni','Hello','retry-id');
    const second=await api.sendText('c-bjarni','Hello','retry-id');
    expect(first.id).toBe('retry-id');expect(second.id).toBe(first.id);
    expect((await api.listMessages('c-bjarni')).items).toHaveLength(before.items.length+1);
    await expect(api.sendText('c-bjarni','Different','retry-id')).rejects.toThrow('message_id_conflict');
  });
});
