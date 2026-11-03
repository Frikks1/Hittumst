import { useCallback, useMemo } from 'react';
import type { StraxBadges } from '@rummal/shared';
import { hittingarFeature } from '@/features/hittingar/config';
import { useStraxResource } from '@/features/strax/hooks';
import { straxApi } from '@/services/strax';
import type { PublicProfile } from '@/types/domain';
import { mergeStraxBadges } from '@/utils/straxBadge';

/** Refresh activity metadata without replacing pages or moving the profile grid. */
export function useStraxGridBadges(profiles: PublicProfile[], scope: string | null): PublicProfile[] {
  const idsKey = profiles.map(profile => profile.id).join(',');
  const loader = useCallback(async (): Promise<StraxBadges> => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!hittingarFeature.enabled || !ids.length) return { items: [], serverNow: new Date().toISOString() };
    const batches = [];
    for (let index = 0; index < ids.length; index += 40) batches.push(ids.slice(index, index + 40));
    const results = await Promise.all(batches.map(batch => straxApi.badges(batch)));
    return { items: results.flatMap(result => result.items), serverNow: results.map(result => result.serverNow).sort().at(-1)! };
  }, [idsKey]);
  const resource = useStraxResource(loader, `grid:${scope}:${idsKey}`);
  return useMemo(() => !hittingarFeature.enabled ? profiles : resource.data ? mergeStraxBadges(profiles, resource.data, resource.receivedAt)
    : resource.error ? profiles.map(profile => ({ ...profile, activeStrax: null })) : profiles, [profiles, resource.data, resource.error, resource.receivedAt]);
}
