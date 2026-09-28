import { describe, expect, it, vi } from 'vitest';
import { matchesIdentityGroups, parseSavedFilters, parseDiscoveryFilters, profilePersonality } from './discoveryPreferences';
import { MockRummalApi } from '@/services/mockApi';
import { DemoMeetupService } from '@/services/meetupDemo';
import { defaultFilters, defaultMeetupFilters } from '@/types/domain';
import { defaultAppearance, parseAppearance } from '@/theme/appearance';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

describe('customization behavior', () => {
  it('requires both identity sections while allowing alternatives inside a section', () => {
    expect(matchesIdentityGroups(['gay', 'trans'], ['gay'])).toBe(false);
    expect(matchesIdentityGroups(['gay', 'bi', 'trans'], ['gay', 'trans'])).toBe(true);
    expect(matchesIdentityGroups(['trans', 'nonbinary'], ['nonbinary'])).toBe(true);
    expect(matchesIdentityGroups([], ['gay'])).toBe(true);
  });
  it('discovery honors the separate section choices', async () => {
    const api = new MockRummalApi();
    const result = await api.discover({ ...defaultFilters, identities: ['gay', 'nonbinary'] });
    expect(result.items).toHaveLength(0);
    const matching = await api.discover({ ...defaultFilters, identities: ['queer', 'nonbinary'] });
    expect(matching.items.length).toBeGreaterThan(0);
    expect(matching.items.every(p => p.identity.includes('queer') && p.identity.includes('nonbinary'))).toBe(true);
  });
  it('restores only supported options and safe filter ranges', () => {
    expect(parseAppearance({ accent: 'red', textScale: 10, reducedMotion: 'false' })).toEqual(defaultAppearance);
    expect(parseDiscoveryFilters({ ageMin: 12, ageMax: 200, identities: ['gay', 'unknown'], tags: ['gaming', 'unknown'] })).toMatchObject({ ageMin: 18, ageMax: 99, identities: ['gay'], tags: ['gaming'] });
    expect(parseSavedFilters([{ id: 'one', name: 'Coffee', filters: defaultFilters }, { id: 'one', name: 'Duplicate' }, null])).toHaveLength(1);
  });
  it('uses real shared interests and preserves ordered interests and prompt on save', async () => {
    const api = new MockRummalApi();
    const saved = await api.updateProfile({ interests: ['Kaffi', 'Göngur'], conversationPrompt: 'Besti göngustaðurinn?', coverPhotoId: null });
    expect(saved.interests).toEqual(['Kaffi', 'Göngur']);
    expect(saved.conversationPrompt).toBe('Besti göngustaðurinn?');
    const person = (await api.discover(defaultFilters)).items[0]!;
    expect(profilePersonality({ ...person, interests: ['Kaffi', 'Göngur'] }, ['göngur'], [])).toEqual({ kind: 'shared', value: 'Göngur' });
  });
  it.each(['2026-09-08T10:00:00Z', '2026-09-12T10:00:00Z', '2026-09-13T23:45:00Z'])('today never includes another date at %s', async now => {
    const service = new DemoMeetupService(new Date(now));
    const today = await service.discover({ ...defaultMeetupFilters, timing: 'today' });
    expect(today.every(item => item.startsAt.slice(0, 10) === now.slice(0, 10))).toBe(true);
    const all = await service.discover(defaultMeetupFilters);
    expect(all.some(item => item.startsAt.slice(0, 10) !== now.slice(0, 10))).toBe(true);
  });
});

describe('private filter persistence',()=>{
 it('upgrades legacy online presets and removes medical selections',()=>{
 expect(parseDiscoveryFilters({onlineOnly:true}).activity).toBe('now');
 expect(parseSavedFilters([{id:'legacy',name:'Saved',filters:{onlineOnly:true,diagnosisIds:['adhd'],radiusKm:10}}])[0]?.filters).toMatchObject({activity:'now',diagnosisIds:[],radiusKm:10});
 });
});
