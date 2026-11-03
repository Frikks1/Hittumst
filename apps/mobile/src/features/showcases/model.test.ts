import { describe, expect, it } from 'vitest';
import type { Showcase } from '@rummal/shared';
import {
  defaultEntryKind,
  moveItem,
  newEntry,
  patchEntry,
  refreshDraftMedia,
  validForSave,
  selectedSharedMeetupMode,
  showcaseAlbumRoute,
  selectableAudiencePeople,
} from './model';

const entryId = 'b1000000-0000-4000-8000-000000000001';
const showcase: Showcase = {
  id: 'a1000000-0000-4000-8000-000000000001',
  ownerId: 'owner',
  template: 'hittingar',
  title: 'My stories',
  introduction: '',
  layout: 'list',
  coverMediaId: null,
  audience: null,
  audienceGroupId: null,
  audiencePersonIds: [],
  audienceGroupName: null,
  audiencePeople: [],
  status: 'draft',
  revision: 1,
  order: 0,
  entries: [],
};

describe('showcase editor', () => {
  it('clears verified count and approval state when published content changes', () => {
    const published = {
      ...newEntry(entryId, 'person'),
      personId: 'friend',
      verifiedCount: 9,
      approvalStatus: 'approved' as const,
    };
    const changed = patchEntry(published, { body: 'A different story' });
    expect(changed.approvalStatus).toBe('draft');
    expect(changed.verifiedCount).toBeNull();
    expect(published.verifiedCount).toBe(9);
  });
  it('keeps people and group presets free of person-rating defaults', () => {
    expect(defaultEntryKind('people')).toBe('person');
    expect(defaultEntryKind('groups')).toBe('group');
    expect(newEntry(entryId, 'person').rating).toBeNull();
    expect(newEntry(entryId, 'group').requirementsInformational).toBe(true);
  });
  it('requires linked selections and explicit review attribution before save', () => {
    const event = newEntry(entryId, 'event');
    expect(validForSave({ ...showcase, entries: [event] })).toBe(false);
    const reviewed = { ...event, meetupIds: ['meetup'], review: 'Copied anonymous feedback' };
    expect(validForSave({ ...showcase, entries: [reviewed] })).toBe(false);
    expect(validForSave({ ...showcase, entries: [{ ...reviewed, reviewIdentified: true }] })).toBe(
      true,
    );
    expect(validForSave({ ...showcase, entries: [newEntry(entryId, 'person')] })).toBe(false);
  });
  it('rejects impossible joining descriptions without enforcing admission', () => {
    const group = {
      ...newEntry(entryId, 'group'),
      groupId: 'group',
      requirements: { minAge: 30, maxAge: 20 },
    };
    expect(validForSave({ ...showcase, entries: [group] })).toBe(false);
    expect(
      validForSave({
        ...showcase,
        entries: [
          {
            ...group,
            requirements: {
              minAge: 18,
              maxAge: 30,
            },
          },
        ],
      }),
    ).toBe(true);
    expect(
      validForSave({ ...showcase, entries: [{ ...group, requirements: { minAge: 17 } }] }),
    ).toBe(false);
  });
  it('reorders entries without changing their identity or overwriting neighbors', () => {
    const items = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    expect(moveItem(items, 1, -1).map((item) => item.id)).toEqual(['two', 'one', 'three']);
    expect(moveItem(items, 2, 1)).toBe(items);
    expect(items.map((item) => item.id)).toEqual(['one', 'two', 'three']);
  });
  it('refreshes media authorization without discarding unsaved stories or readding removed media', () => {
    const mediaId = 'c1000000-0000-4000-8000-000000000001';
    const removedId = 'c1000000-0000-4000-8000-000000000002';
    const draft = {
      ...showcase,
      entries: [
        {
          ...newEntry(entryId, 'story'),
          body: 'My unsaved story',
          media: [
            {
              id: mediaId,
              kind: 'photo' as const,
              caption: 'Unsaved caption',
              url: 'https://old.test',
            },
          ],
        },
      ],
    };
    const server = {
      ...showcase,
      entries: [
        {
          ...newEntry(entryId, 'story'),
          body: 'Old story',
          media: [
            {
              id: removedId,
              kind: 'photo' as const,
              caption: 'Removed',
              url: 'https://fresh.test',
            },
          ],
        },
      ],
    };
    const updated = refreshDraftMedia(draft, server);
    expect(updated.entries[0]!.body).toBe('My unsaved story');
    expect(updated.entries[0]!.media).toHaveLength(1);
    expect(updated.entries[0]!.media[0]!.caption).toBe('Unsaved caption');
    expect(updated.entries[0]!.media[0]!.url).toBeUndefined();
  });
  it('materializes all shared selections without a 50-meetup limit or automatic expansion', () => {
    const eligible = Array.from({ length: 80 }, (_, index) => 'meetup-' + index);
    expect(selectedSharedMeetupMode([...eligible], eligible)).toBe('all');
    const saved = eligible.slice(0, 79);
    expect(selectedSharedMeetupMode(saved, eligible)).toBe('choose');
    expect(saved).toHaveLength(79);
    expect(selectedSharedMeetupMode([], eligible)).toBe('none');
  });
  it('opens an album for visitors only through an authorized share link', () => {
    const album = { id: 'album-id', title: 'Memories' };
    expect(showcaseAlbumRoute(album, false)).toBeNull();
    expect(showcaseAlbumRoute(album, true)).toBe('/albums/album-id');
    expect(showcaseAlbumRoute({ ...album, shareId: 'share-id' }, false)).toBe(
      '/album-share/share-id',
    );
  });
  it('new group stories show members while blank stories have no linked albums', () => {
    expect(newEntry(entryId, 'group').showMembers).toBe(true);
    expect(newEntry(entryId, 'story').albumIds).toEqual([]);
  });
  it('offers friends and current group members once, excluding the owner', () => {
    const pickers = {
      events: [],
      requirementEvents: [],
      media: [],
      albums: [],
      friends: [{ id: 'friend', displayName: 'Friend' }],
      groups: [
        {
          id: 'group',
          name: 'Group',
          memberVisible: true,
          members: [
            { id: 'owner', displayName: 'Me' },
            { id: 'friend', displayName: 'Friend' },
            { id: 'member', displayName: 'Member' },
          ],
        },
      ],
    };
    expect(selectableAudiencePeople(pickers, 'owner').map((person) => person.id)).toEqual([
      'friend',
      'member',
    ]);
  });
});
