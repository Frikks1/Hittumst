import type { IcelandRegion, Identity, Intent, ProfileSocial } from '@/types/domain';
import { profileIdentityChoices, supportedSocialPlatforms } from './profileExtras';

export type OnboardingDraft = {
  version: 1; step: number; dob: string; displayName: string; pronouns: string;
  identity: Identity[]; lookingFor: Intent[]; bio: string; videos: string[];
  socials: ProfileSocial[]; interests: string[]; region: IcelandRegion;
};
export const emptyOnboardingDraft = (): OnboardingDraft => ({
  version: 1, step: 0, dob: '', displayName: '', pronouns: '', identity: [],
  lookingFor: [], bio: '', videos: [], socials: [], interests: [], region: 'capital',
});
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const list = (value: unknown, max: number, length: number) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => text(item, length)))].slice(0, max) : [];

/** Pick only editable fields. Consent acceptance is deliberately never restored or serialized. */
export function parseOnboardingDraft(value: unknown): OnboardingDraft | null {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return null;
  const data = value as Record<string, unknown>;
  return {
    version: 1, step: typeof data.step === 'number' && Number.isInteger(data.step) ? Math.max(0, Math.min(4, data.step)) : 0,
    dob: /^\d{4}-\d{2}-\d{2}$/.test(text(data.dob, 10)) ? text(data.dob, 10) : '',
    displayName: text(data.displayName, 50), pronouns: text(data.pronouns, 60), bio: text(data.bio, 500),
    identity: list(data.identity, 8, 30).filter((item): item is Identity => profileIdentityChoices.includes(item as Identity)),
    lookingFor: list(data.lookingFor, 4, 20).filter((item): item is Intent => ['chat', 'dates', 'friends', 'relationship'].includes(item)),
    videos: list(data.videos, 3, 2000), interests: list(data.interests, 12, 80),
    socials: Array.isArray(data.socials) ? data.socials.flatMap(item => {
      if (!item || typeof item !== 'object' || !supportedSocialPlatforms.includes(item.platform)) return [];
      return [{ platform: item.platform, handle: text(item.handle, 200) }];
    }).slice(0, 9) : [],
    region: ['capital', 'south', 'west', 'westfjords', 'north', 'east'].includes(String(data.region)) ? data.region as IcelandRegion : 'capital',
  };
}
export function resumedOnboardingStep(draft: OnboardingDraft): number {
  // Always revisit the consent screen before completing a recovered form.
  return Math.min(draft.step, 2);
}
