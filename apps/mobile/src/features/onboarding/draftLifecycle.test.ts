import { describe, expect, it } from 'vitest';
import { createOnboardingDraftStore } from './draftLifecycle';

describe('onboarding draft cleanup ordering', () => {
  it('removes an in-flight save and rejects late saves from the signed-out form', async () => {
    const drafts = new Map<string, string>();
    let release!: () => void;
    let started!: () => void;
    const writing = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const store = createOnboardingDraftStore({
      getItem: async id => drafts.get(id) ?? null,
      setItem: async (id, value) => { started(); await pending; drafts.set(id, value); },
      removeItem: async id => { drafts.delete(id); },
    });
    const previousSession = store.generation('a');
    const save = store.set('a', 'private profile', previousSession);
    await writing;
    const cleanup = store.clear('a');
    const lateSave = store.set('a', 'late component cleanup', previousSession);
    release();
    await Promise.all([save, cleanup, lateSave]);
    expect(await store.get('a')).toBeNull();
    await store.set('a', 'new signed-in session');
    expect(await store.get('a')).toBe('new signed-in session');
  });

  it('rejects queued old-session writes while leaving another account intact', async () => {
    const drafts = new Map<string, string>();
    const store = createOnboardingDraftStore({
      getItem: async id => drafts.get(id) ?? null,
      setItem: async (id, value) => { drafts.set(id, value); },
      removeItem: async id => { drafts.delete(id); },
    });
    await store.set('b', 'other member');
    const previousSession = store.generation('a');
    await Promise.all([store.set('a', 'queued', previousSession), store.clear('a'), store.set('a', 'late', previousSession)]);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBe('other member');
  });
});
