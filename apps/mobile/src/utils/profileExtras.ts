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

export const musicSocialPlatforms = [
  { platform: 'spotify', labelKey: 'profile.spotify' },
  { platform: 'soundcloud', labelKey: 'profile.soundcloud' },
] as const;

export const supportedSocialPlatforms: readonly SocialPlatform[] = [
  ...socialPlatforms.map(item => item.platform),
  ...musicSocialPlatforms.map(item => item.platform),
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
  const value = social.handle.trim().replace(/^@/, '');
  if (!value || /\s/.test(value)) return '';
  const bases: Record<Exclude<SocialPlatform, 'website'>, string> = {
    instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@',
    x: 'https://x.com/', youtube: 'https://youtube.com/@',
    discord: 'https://discord.com/users/', steam: 'https://steamcommunity.com/id/',
    spotify: 'https://open.spotify.com/user/', soundcloud: 'https://soundcloud.com/',
  };
  const base = social.platform === 'website' ? undefined : bases[social.platform];
  const expectedHost = base ? new URL(base).hostname : undefined;
  const isUrl = /^https?:\/\//i.test(value) || social.platform === 'website'
    || Boolean(expectedHost && (value.toLowerCase().startsWith(`${expectedHost}/`) || value.toLowerCase().startsWith(`www.${expectedHost}/`)));
  try {
    const url = new URL(isUrl ? /^https?:\/\//i.test(value) ? value : `https://${value}` : `${base}${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || expectedHost && url.hostname.replace(/^www\./, '') !== expectedHost) return '';
    url.protocol = 'https:';
    return url.toString();
  } catch { return ''; }
}
