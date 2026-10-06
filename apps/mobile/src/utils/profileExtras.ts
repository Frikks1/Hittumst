import type { Identity, ProfileSocial, SocialPlatform } from '@/types/domain';

export const profileIdentityChoices: Identity[] = ['gay', 'bi', 'queer', 'trans', 'nonbinary', 'lesbian', 'not_applicable', 'prefer_not_to_say'];

const undisclosedIdentities: Identity[] = ['not_applicable', 'prefer_not_to_say'];

export function toggleProfileIdentity(value: Identity, values: Identity[]): Identity[] {
  if (values.includes(value)) return values.filter(item => item !== value);
  if (undisclosedIdentities.includes(value)) return [value];
  return [...values.filter(item => !undisclosedIdentities.includes(item)), value];
}

export const socialPlatforms: Array<{ platform: SocialPlatform; labelKey: 'profile.instagram' | 'profile.tiktok' | 'profile.x' | 'profile.discord' | 'profile.steam' | 'profile.youtube' | 'profile.website' }> = [
  { platform: 'instagram', labelKey: 'profile.instagram' },
  { platform: 'tiktok', labelKey: 'profile.tiktok' },
  { platform: 'x', labelKey: 'profile.x' },
  { platform: 'discord', labelKey: 'profile.discord' },
  { platform: 'steam', labelKey: 'profile.steam' },
  { platform: 'youtube', labelKey: 'profile.youtube' },
  { platform: 'website', labelKey: 'profile.website' },
];

export function parseProfileList(value: string, limit: number): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function updateSocialHandle(socials: ProfileSocial[], platform: SocialPlatform, handle: string): ProfileSocial[] {
  const remaining = socials.filter((social) => social.platform !== platform);
  const trimmed = handle.trim();
  return trimmed ? [...remaining, { platform, handle: trimmed }] : remaining;
}

export function socialUrl(social: ProfileSocial): string {
  const value = social.handle.replace(/^@/, '');
  if (social.platform === 'website') return /^https?:\/\//i.test(social.handle) ? social.handle : `https://${social.handle}`;
  const host = social.platform === 'instagram' ? 'instagram.com/' : social.platform === 'tiktok' ? 'tiktok.com/@' : social.platform === 'x' ? 'x.com/' : social.platform === 'youtube' ? 'youtube.com/@' : social.platform === 'discord' ? 'discord.com/users/' : social.platform === 'steam' ? 'steamcommunity.com/id/' : 'x.com/';
  return `https://${host}${value}`;
}
