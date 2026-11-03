import type { OwnProfile } from '@/types/domain';
import { socialUrl, supportedSocialPlatforms } from './profileExtras';

const editableFields = [
  'displayName', 'pronouns', 'identity', 'lookingFor', 'tags', 'videos', 'customTags',
  'socials', 'interests', 'coverPhotoId', 'appearance', 'conversationPrompt', 'bio',
  'region', 'isHidden', 'adultProfileTagsEnabled', 'starredProfileAudience',
  'meetupRsvpVisibilityDefault', 'commentWallEnabled', 'gender',
  'friendsOfFriendsDiscovery', 'showOnline', 'locationSharing',
] as const satisfies readonly (keyof OwnProfile)[];

/** Owner updates never change server media, account IDs, or the private source of age. */
export function normalizeProfileEdit(input: Partial<OwnProfile>): Partial<OwnProfile> {
  const update: Partial<OwnProfile> = Object.fromEntries(editableFields
    .filter(key => input[key] !== undefined).map(key => [key, input[key]]));
  if (update.displayName !== undefined) {
    update.displayName = update.displayName.trim();
    if (!update.displayName || update.displayName.length > 50) throw new Error('invalid_profile_display_name');
  }
  if (update.pronouns !== undefined) {
    update.pronouns = update.pronouns.trim();
    if (update.pronouns.length > 50) throw new Error('invalid_profile_pronouns');
  }
  if (update.bio !== undefined && update.bio.length > 500) throw new Error('invalid_profile_bio');
  if (update.interests !== undefined) {
    update.interests = [...new Set(update.interests.map(value => value.trim()))];
    if (update.interests.length > 12 || update.interests.some(value => !value || value.length > 80)) {
      throw new Error('invalid_profile_interests');
    }
  }
  if (update.lookingFor !== undefined && (update.lookingFor.length > 10
    || update.lookingFor.some(value => !['chat', 'dates', 'friends', 'relationship'].includes(value)))) {
    throw new Error('invalid_profile_intentions');
  }
  if (update.socials !== undefined) {
    update.socials = update.socials.map(social => ({ ...social, handle: social.handle.trim() }));
    if (update.socials.length > supportedSocialPlatforms.length
      || new Set(update.socials.map(social => social.platform)).size !== update.socials.length
      || update.socials.some(social => !supportedSocialPlatforms.includes(social.platform)
        || !social.handle || social.handle.length > 500 || !socialUrl(social))) {
      throw new Error('invalid_profile_social');
    }
  }
  return update;
}
