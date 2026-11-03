import type { PublicProfile } from '@/types/domain';

export function sharedConversationInterests(own: Pick<PublicProfile, 'interests'>, peer: Pick<PublicProfile, 'interests'>): string[] {
  const normalize = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('en-GB');
  const mine = new Set(own.interests.map(normalize).filter(Boolean));
  const seen = new Set<string>();
  return peer.interests.filter(value => {
    const key = normalize(value);
    if (!key || !mine.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(value => value.trim()).slice(0, 3);
}
