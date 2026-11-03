import { beforeEach, describe, expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => values.get(key) ?? null,
  setItem: async (key: string, value: string) => { values.set(key, value); },
} }));
import { dismissOnboardingChecklist, getOnboardingChecklist, markFirstConversationStarted, startOnboardingChecklist } from './checklistStorage';
beforeEach(() => values.clear());
describe('optional first-session checklist', () => {
  it('activates only for a completed signup and isolates dismissals between accounts', async () => {
    expect((await getOnboardingChecklist('new')).active).toBe(false);
    await startOnboardingChecklist('new'); await dismissOnboardingChecklist('new');
    expect(await getOnboardingChecklist('new')).toMatchObject({ active: true, dismissed: true });
    expect(await getOnboardingChecklist('other')).toMatchObject({ active: false, dismissed: false });
  });
  it('preserves first-send progress when dismissal and send finish together', async () => {
    await startOnboardingChecklist('a');
    await Promise.all([markFirstConversationStarted('a'), dismissOnboardingChecklist('a')]);
    expect(await getOnboardingChecklist('a')).toEqual({ active: true, dismissed: true, conversationStarted: true });
    expect([...values.values()].join('')).not.toContain('message');
  });
});
