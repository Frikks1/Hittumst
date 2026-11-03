import type { StraxBadges } from '@rummal/shared';
import type { ActiveStraxBadge, PublicProfile } from '@/types/domain';

/** A monotonic clock prevents changes to the device date from renewing a badge. */
export function straxElapsedClock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function straxBadgeRemaining(badge: ActiveStraxBadge, now = straxElapsedClock()): number {
  return Math.max(0, Date.parse(badge.expiresAt) - Date.parse(badge.serverNow) - Math.max(0, now - badge.receivedAt));
}

export function mergeStraxBadges(profiles: PublicProfile[], result: StraxBadges, receivedAt = straxElapsedClock()): PublicProfile[] {
  const permitted = new Set(profiles.map(profile => profile.id));
  const byProfile = new Map(result.items.filter(item => permitted.has(item.profileId) && Date.parse(item.expiresAt) > Date.parse(result.serverNow))
    .map(item => [item.profileId, { id: item.activityId, title: item.title, expiresAt: item.expiresAt, serverNow: result.serverNow, receivedAt }]));
  return profiles.map(profile => ({ ...profile, activeStrax: byProfile.get(profile.id) ?? null }));
}

export function straxBubbleTitle(title: string): string {
  const characters = Array.from(title);
  return characters.length <= 24 ? title : `${characters.slice(0, 23).join('')}…`;
}
