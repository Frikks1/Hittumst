import { describe, expect, it } from 'vitest';
import { normalizeProfileEdit } from './profileEditing';
import { socialUrl } from './profileExtras';

describe('profile edit normalization', () => {
  it('accepts the editor draft while ignoring server-owned fields and the source of age', () => {
    expect(normalizeProfileEdit({
      id: 'another-account', age: 19, dateOfBirth: '2007-01-01', photos: [],
      displayName: ' Alex ', pronouns: ' they/them ', interests: ['Music', ' Coffee ', 'Music'],
      lookingFor: ['chat', 'friends'], gender: 'nonbinary', bio: 'Hello',
    })).toEqual({ displayName: 'Alex', pronouns: 'they/them', interests: ['Music', 'Coffee'],
      lookingFor: ['chat', 'friends'], gender: 'nonbinary', bio: 'Hello' });
  });

  it.each([
    [{ displayName: ' ' }, 'invalid_profile_display_name'],
    [{ displayName: 'x'.repeat(51) }, 'invalid_profile_display_name'],
    [{ pronouns: 'x'.repeat(51) }, 'invalid_profile_pronouns'],
    [{ bio: 'x'.repeat(501) }, 'invalid_profile_bio'],
    [{ interests: Array.from({ length: 13 }, (_, index) => `Interest ${index}`) }, 'invalid_profile_interests'],
    [{ interests: [' '] }, 'invalid_profile_interests'],
    [{ interests: ['x'.repeat(81)] }, 'invalid_profile_interests'],
  ] as const)('rejects an invalid editable field before saving', (draft, message) => {
    expect(() => normalizeProfileEdit(draft as Parameters<typeof normalizeProfileEdit>[0])).toThrow(message);
  });

  it('preserves existing unrelated partial profile updates', () => {
    expect(normalizeProfileEdit({ isHidden: true, locationSharing: false, commentWallEnabled: false,
      friendsOfFriendsDiscovery: true, coverPhotoId: null })).toEqual({ isHidden: true,
      locationSharing: false, commentWallEnabled: false, friendsOfFriendsDiscovery: true, coverPhotoId: null });
  });

  it('retains the existing appearance, cover and customization values in a full editor save', () => {
    const draft = { appearance: { palette: 'fern', banner: 'aurora', effect: 'fireflies', avatarBorder: 'ferns' },
      coverPhotoId: 'photo-id', customTags: ['Synth pop'], tags: ['music'],
      videos: ['https://example.test/video'], conversationPrompt: 'Favorite record?',
      region: 'capital', adultProfileTagsEnabled: false, starredProfileAudience: 'friends',
      meetupRsvpVisibilityDefault: 'private', showOnline: false } as const;
    expect(normalizeProfileEdit({ ...draft, customTags: [...draft.customTags], tags: [...draft.tags], videos: [...draft.videos] })).toEqual(draft);
  });

  it('saves optional music accounts alongside an Instagram account', () => {
    expect(normalizeProfileEdit({ socials: [
      { platform: 'instagram', handle: 'alex_synth' },
      { platform: 'spotify', handle: ' https://open.spotify.com/user/alex ' },
      { platform: 'soundcloud', handle: 'alex-synth' },
    ] }).socials).toEqual([
      { platform: 'instagram', handle: 'alex_synth' },
      { platform: 'spotify', handle: 'https://open.spotify.com/user/alex' },
      { platform: 'soundcloud', handle: 'alex-synth' },
    ]);
    expect(() => normalizeProfileEdit({ socials: [
      { platform: 'instagram', handle: 'alex' }, { platform: 'instagram', handle: 'other' },
    ] })).toThrow('invalid_profile_social');
  });
});

describe('social account links', () => {
  it.each([
    [{ platform: 'instagram', handle: '@alex_synth' }, 'https://instagram.com/alex_synth'],
    [{ platform: 'instagram', handle: 'instagram.com/alex_synth' }, 'https://instagram.com/alex_synth'],
    [{ platform: 'spotify', handle: 'https://open.spotify.com/artist/example' }, 'https://open.spotify.com/artist/example'],
    [{ platform: 'spotify', handle: 'alex' }, 'https://open.spotify.com/user/alex'],
    [{ platform: 'soundcloud', handle: 'soundcloud.com/alex-synth' }, 'https://soundcloud.com/alex-synth'],
  ] as const)('resolves an account or copied link without repeating its hostname', (social, expected) => {
    expect(socialUrl(social)).toBe(expected);
  });
  it.each(['https://other.test/alex', 'https://alex:secret@instagram.com/alex', 'https://instagram.com/al ex'])('rejects an invalid account URL', handle => {
    expect(socialUrl({ platform: 'instagram', handle })).toBe('');
    expect(() => normalizeProfileEdit({ socials: [{ platform: 'instagram', handle }] })).toThrow('invalid_profile_social');
  });
});
