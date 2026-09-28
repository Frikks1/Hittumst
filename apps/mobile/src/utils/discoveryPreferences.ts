import { discoveryExtensionSchema, activityFilterSchema, defaultDiscoveryExtensions } from '@rummal/shared';
import { defaultFilters, type DiscoveryFilters, type Identity, type Intent, type PublicProfile } from '@/types/domain';
import { profileTagById } from '@/data/profileTags';

export const orientationChoices: Identity[] = ['gay', 'bi', 'lesbian', 'queer'];
export const genderChoices: Identity[] = ['trans', 'nonbinary'];
export function matchesIdentityGroups(selected: Identity[], actual: Identity[]) {
  return [orientationChoices, genderChoices].every(group => {
    const choices = selected.filter(value => group.includes(value));
    return !choices.length || choices.some(value => actual.includes(value));
  });
}
export type SavedDiscoveryFilter = { id: string; name: string; filters: DiscoveryFilters };
export function parseDiscoveryFilters(value: unknown): DiscoveryFilters {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const ageMin = Number.isInteger(p.ageMin) ? Math.min(99, Math.max(18, p.ageMin as number)) : 18;
  const ageMax = Number.isInteger(p.ageMax) ? Math.min(99, Math.max(ageMin, p.ageMax as number)) : 99;
  const extensions = discoveryExtensionSchema.safeParse(p);
  return { ...defaultFilters, ...(extensions.success ? extensions.data : defaultDiscoveryExtensions), ageMin, ageMax,
    identities: Array.isArray(p.identities) ? [...new Set(p.identities.filter((v): v is Identity => [...orientationChoices, ...genderChoices].includes(v)))] : [],
    intents: Array.isArray(p.intents) ? [...new Set(p.intents.filter((v): v is Intent => ['chat', 'dates', 'friends', 'relationship'].includes(v)))] : [],
    tags: Array.isArray(p.tags) ? [...new Set(p.tags.filter((v): v is string => typeof v === 'string' && profileTagById.has(v)))].slice(0, 3) : [],
    activity: activityFilterSchema.safeParse(p.activity).success ? p.activity as DiscoveryFilters['activity'] : p.onlineOnly === true ? 'now' : 'all',
  };
}
export function parseSavedFilters(value: unknown): SavedDiscoveryFilter[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim() || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{ id: item.id.slice(0, 80), name: item.name.trim().slice(0, 40), filters: { ...parseDiscoveryFilters(item.filters), diagnosisIds: [] } }];
  }).slice(0, 5);
}
export function profilePersonality(profile: PublicProfile, ownInterests: string[], ownTags: string[]) {
  const normalize = (s: string) => s.trim().toLocaleLowerCase('is');
  const shared = profile.interests.find(item => ownInterests.some(own => normalize(own) === normalize(item)));
  if (shared) return { kind: 'shared' as const, value: shared };
  const tag = profile.tags.find(id => ownTags.includes(id) && profileTagById.get(id)?.category === 'hobbies');
  if (tag) return { kind: 'sharedTag' as const, value: tag };
  if (profile.interests[0]) return { kind: 'interest' as const, value: profile.interests[0] };
  if (profile.lookingFor[0]) return { kind: 'intent' as const, value: profile.lookingFor[0] };
  return null;
}

export function discoveryFilterCount(f: DiscoveryFilters): number {
  return [f.ageMin > 18 || f.ageMax < 99, f.identities.some(i => orientationChoices.includes(i)), f.identities.some(i => genderChoices.includes(i)) || f.genders.length > 0, f.intents.length > 0, f.tags.length > 0, f.activity !== 'all', f.radiusKm !== null, f.social !== 'all', f.diagnosisIds.length > 0].filter(Boolean).length;
}
