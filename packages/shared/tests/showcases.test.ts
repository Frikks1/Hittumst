import { describe, expect, it } from 'vitest';
import {
  showcaseSchema,
  showcaseSaveInputSchema,
  showcaseRequirementsSchema,
  showcaseSaveInput,
  showcasePickersSchema,
  showcaseApprovalSchema,
  validateShowcaseAudienceScope,
  type ShowcaseAudience,
  type ShowcaseAudienceScope,
} from '../src/showcases';

const showcaseId = '10000000-0000-4000-8000-000000000001';
const entryId = '10000000-0000-4000-8000-000000000002';
const mediaId = '10000000-0000-4000-8000-000000000003';
const albumId = '10000000-0000-4000-8000-000000000004';
const shareId = '10000000-0000-4000-8000-000000000005';
const baseInput = () => ({
  id: null,
  expectedRevision: 0,
  template: 'passions',
  title: 'Passions',
  entries: [{ id: entryId, kind: 'story' }],
});

describe('showcase contracts', () => {
  it('keeps drafts private with empty audience, album and roster defaults', () => {
    const value = showcaseSchema.parse({
      id: showcaseId, ownerId: 'demo-me', template: 'groups', title: 'My crew', revision: 1,
      entries: [{ id: entryId, kind: 'group', groupId: 'demo-group', requirements: { minAge: 18, maxAge: 40, memberType: 'Walking friends', meetupId: 'demo-event' } }],
    });
    expect(value).toMatchObject({ audience: null, status: 'draft', audienceGroupId: null, audiencePersonIds: [], audienceGroupName: null, audiencePeople: [] });
    expect(value.entries[0]).toMatchObject({ requirementsInformational: true, albumIds: [], albums: [], groupMembers: [], showMembers: false });
    expect(showcaseRequirementsSchema.safeParse({ minAge: 40, maxAge: 18 }).success).toBe(false);
    expect(showcaseRequirementsSchema.safeParse({ minAge: 17 }).success).toBe(false);
  });

  it.each([
    { minSponsorIsk: 500 },
    { sponsorMeetupId: 'demo-event' },
    { minSponsorIsk: 0, sponsorMeetupId: 'demo-event' },
    { minAge: 18, memberType: 'Walking friends', minSponsorIsk: 500, sponsorMeetupId: 'demo-event' },
  ])('strictly rejects removed sponsorship joining conditions: %j', (requirements) => {
    expect(showcaseRequirementsSchema.safeParse(requirements).success).toBe(false);
    expect(showcaseSaveInputSchema.safeParse({ ...baseInput(), entries: [{ id: entryId, kind: 'group', groupId: 'demo-group', requirements }] }).success).toBe(false);
  });

  it('retains optional age, member type, attendance and descriptive text', () => {
    expect(showcaseRequirementsSchema.parse({ minAge: 25, maxAge: 60, memberType: 'Walking friends', meetupId: 'demo-event', text: 'Easy walks and good company.' })).toEqual({ minAge: 25, maxAge: 60, memberType: 'Walking friends', meetupId: 'demo-event', text: 'Easy walks and good company.' });
  });

  const validScopes: Array<[ShowcaseAudience, ShowcaseAudienceScope, object]> = [
    ['everyone', {}, { personIds: [] }],
    ['friends', {}, { personIds: [] }],
    ['no_one', {}, { personIds: [] }],
    ['group', { groupId: 'demo-group' }, { groupId: 'demo-group', personIds: [] }],
    ['people', { personIds: ['demo-friend', 'demo-other'] }, { personIds: ['demo-friend', 'demo-other'] }],
  ];
  it.each(validScopes)('requires the appropriate exact scope for audience %s', (audience, scope, expected) => {
    expect(validateShowcaseAudienceScope(audience, scope)).toEqual(expected);
  });

  const invalidScopes: Array<[ShowcaseAudience, ShowcaseAudienceScope]> = [
    ['group', {}],
    ['group', { personIds: ['demo-friend'] }],
    ['group', { groupId: 'demo-group', personIds: ['demo-friend'] }],
    ['people', {}],
    ['people', { personIds: [] }],
    ['people', { groupId: 'demo-group' }],
    ['people', { groupId: 'demo-group', personIds: ['demo-friend'] }],
    ['people', { personIds: ['demo-friend', 'demo-friend'] }],
    ['everyone', { groupId: 'demo-group' }],
    ['everyone', { personIds: ['demo-friend'] }],
    ['friends', { personIds: ['demo-friend'] }],
    ['no_one', { groupId: 'demo-group' }],
  ];
  it.each(invalidScopes)('rejects missing, duplicate or inappropriate %s targets: %j', (audience, scope) => {
    expect(() => validateShowcaseAudienceScope(audience, scope)).toThrow('invalid_showcase_audience_scope');
  });

  it('rejects unknown scope fields and recipient lists exceeding the selection limit', () => {
    expect(() => validateShowcaseAudienceScope('group', { groupId: 'demo-group', recipientNames: ['Friend'] } as never)).toThrow();
    expect(() => validateShowcaseAudienceScope('people', { personIds: Array.from({ length: 51 }, (_, index) => 'person-' + index) })).toThrow();
  });

  it('parses selected audience labels on showcase and exact approval projections', () => {
    const value = showcaseSchema.parse({ id: showcaseId, ownerId: 'demo-me', template: 'groups', title: 'My crew', revision: 2, audience: 'group', audienceGroupId: 'demo-group', audienceGroupName: 'Weekend friends' });
    expect(value).toMatchObject({ audience: 'group', audienceGroupId: 'demo-group', audienceGroupName: 'Weekend friends', audiencePersonIds: [], audiencePeople: [] });
    const approval = showcaseApprovalSchema.parse({
      id: mediaId, showcaseId, entryId, revision: 2, role: 'person', recipientId: 'demo-friend', status: 'pending',
      audience: 'people', audiencePersonIds: ['demo-viewer'], audiencePeople: [{ id: 'demo-viewer', displayName: 'A chosen viewer' }],
      showcaseTitle: 'My crew', entryTitle: 'Walking friends', entryBody: 'Our weekend story.', snapshot: { id: entryId, kind: 'group' },
    });
    expect(approval).toMatchObject({ audience: 'people', audienceGroupId: null, audienceGroupName: null, audiencePersonIds: ['demo-viewer'], audiencePeople: [{ id: 'demo-viewer', displayName: 'A chosen viewer' }] });
  });

  it('supports optional authorized album-share routes and private roster projections', () => {
    const value = showcaseSchema.parse({ id: showcaseId, ownerId: 'demo-me', template: 'groups', title: 'My crew', revision: 1,
      entries: [{ id: entryId, kind: 'group', albumIds: [albumId], showMembers: true, albums: [{ id: albumId, title: 'Our walk', shareId }, { id: 'owned-album', title: 'My own album' }], groupMembers: [{ id: 'demo-friend', displayName: 'Friend' }] }],
    });
    expect(value.entries[0]?.albums).toEqual([{ id: albumId, title: 'Our walk', shareId }, { id: 'owned-album', title: 'My own album' }]);
    const pickers = showcasePickersSchema.parse({ events: [], friends: [], groups: [{ id: 'demo-group', name: 'Weekend friends' }], media: [] });
    expect(pickers).toMatchObject({ albums: [], requirementEvents: [], groups: [{ id: 'demo-group', name: 'Weekend friends', members: [], memberVisible: true }] });
  });

  it('strips computed permission, count, audience labels, albums, rosters and media fields from owner edit input', () => {
    const value = showcaseSchema.parse({
      id: showcaseId, ownerId: 'demo-me', template: 'hittingar', title: 'Memories', revision: 3, audience: 'people', audiencePersonIds: ['demo-friend'], audiencePeople: [{ id: 'demo-friend', displayName: 'Friend' }], status: 'published',
      entries: [{ id: entryId, kind: 'event', meetupIds: ['event'], verifiedCount: 12, meetups: [{ id: 'event', title: 'Event' }], requirementMeetups: [{ id: 'event', title: 'Requirement event' }], albumIds: [albumId], albums: [{ id: albumId, title: 'Private album', shareId }], showMembers: true, groupMembers: [{ id: 'demo-friend', displayName: 'Friend' }], approvalStatus: 'approved', media: [{ id: mediaId, kind: 'photo', caption: 'Hello', bucket: 'showcase-media', storagePath: 'private/path', url: 'https://storage.test/secret' }] }],
    });
    const input = showcaseSaveInput(value);
    expect(input.expectedRevision).toBe(3);
    for (const field of ['audience', 'audienceGroupId', 'audiencePersonIds', 'audienceGroupName', 'audiencePeople']) expect(input).not.toHaveProperty(field);
    for (const field of ['verifiedCount', 'approvalStatus', 'meetups', 'requirementMeetups', 'albums', 'groupMembers', 'requirementsInformational']) expect(input.entries[0]).not.toHaveProperty(field);
    expect(input.entries[0]).toMatchObject({ albumIds: [albumId], showMembers: true });
    expect(input.entries[0]?.media[0]).toEqual({ id: mediaId, kind: 'photo', caption: 'Hello' });
  });

  it.each([
    { verifiedCount: 900 },
    { approvalStatus: 'approved' },
    { albums: [{ id: albumId, title: 'Untrusted album' }] },
    { groupMembers: [{ id: 'untrusted-member', displayName: 'Untrusted member' }] },
    { media: [{ id: mediaId, kind: 'photo', storagePath: 'someone/else' }] },
    { rating: 6 },
    { rating: 2.5 },
  ])('rejects caller-supplied derived disclosure or invalid scores: %j', (patch) => {
    const base = baseInput();
    expect(showcaseSaveInputSchema.safeParse({ ...base, entries: [{ ...base.entries[0], ...patch }] }).success).toBe(false);
  });

  it('supports explicit shared-meetup snapshots beyond fifty occurrences', () => {
    const meetupIds = Array.from({ length: 75 }, (_, index) => 'event-' + index);
    const input = showcaseSaveInputSchema.parse({ ...baseInput(), entries: [{ id: entryId, kind: 'person', personId: 'demo-friend', meetupIds }] });
    expect(input.entries[0]?.meetupIds).toEqual(meetupIds);
  });
});
