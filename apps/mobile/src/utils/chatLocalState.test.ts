import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ os: 'ios', secureGet: vi.fn(), secureSet: vi.fn(), secureRemove: vi.fn(), plainGet: vi.fn(), plainSet: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { get OS() { return mocks.os; } } }));
vi.mock('@/services/secureStorage', () => ({ authStorage: { getItem: mocks.secureGet, setItem: mocks.secureSet, removeItem: mocks.secureRemove } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: mocks.plainGet, setItem: mocks.plainSet } }));
import { chatAccountGeneration, clearChatLocalAccount, readChatDrafts, readConversationPreferences, saveChatDraft, setConversationPreference } from './chatLocalState';

let secure: Map<string, string>;
let plain: Map<string, string>;
beforeEach(async () => {
  mocks.os = 'ios'; vi.resetAllMocks(); secure = new Map(); plain = new Map();
  mocks.secureGet.mockImplementation(async key => secure.get(key) ?? null);
  mocks.secureSet.mockImplementation(async (key, value) => { secure.set(key, value); });
  mocks.secureRemove.mockImplementation(async key => { secure.delete(key); });
  mocks.plainGet.mockImplementation(async key => plain.get(key) ?? null);
  mocks.plainSet.mockImplementation(async (key, value) => { plain.set(key, value); });
  await Promise.all(['alice', 'bob'].map(clearChatLocalAccount));
});

describe('private conversation drafts', () => {
  it('isolates the same conversation id across accounts and avoids native plaintext storage', async () => {
    await saveChatDraft('alice', 'conversation', 'Alice’s private draft');
    await saveChatDraft('bob', 'conversation', 'Bob’s private draft');
    expect(await readChatDrafts('alice')).toEqual({ conversation: 'Alice’s private draft' });
    expect(await readChatDrafts('bob')).toEqual({ conversation: 'Bob’s private draft' });
    expect(mocks.plainSet).not.toHaveBeenCalled();
  });
  it('serializes overlapping edits and removes an empty draft', async () => {
    await Promise.all([saveChatDraft('alice', 'one', 'first'), saveChatDraft('alice', 'one', 'latest'), saveChatDraft('alice', 'two', 'second')]);
    expect(await readChatDrafts('alice')).toEqual({ one: 'latest', two: 'second' });
    await saveChatDraft('alice', 'one', '');
    expect(await readChatDrafts('alice')).toEqual({ two: 'second' });
  });
  it('revokes stale component writes so late cleanup cannot restore signed-out drafts', async () => {
    const generation = chatAccountGeneration('alice');
    await saveChatDraft('alice', 'one', 'private', generation);
    await Promise.all([saveChatDraft('alice', 'two', 'queued', generation), clearChatLocalAccount('alice'), saveChatDraft('alice', 'one', 'late unmount', generation)]);
    expect(await readChatDrafts('alice')).toEqual({});
    expect(secure.size).toBe(0);
    await saveChatDraft('alice', 'one', 'new signed-in session');
    expect(await readChatDrafts('alice')).toEqual({ one: 'new signed-in session' });
  });
  it('uses memory for web drafts and wipes them on account cleanup', async () => {
    mocks.os = 'web';
    await saveChatDraft('alice', 'one', 'sensitive web draft');
    expect(await readChatDrafts('alice')).toEqual({ one: 'sensitive web draft' });
    expect(await readChatDrafts('bob')).toEqual({});
    expect(mocks.secureSet).not.toHaveBeenCalled(); expect(mocks.plainSet).not.toHaveBeenCalled();
    await clearChatLocalAccount('alice');
    expect(await readChatDrafts('alice')).toEqual({});
  });
  it('leaves failed writes indexed so signout can remove partial data', async () => {
    mocks.secureSet.mockImplementation(async (key, value) => { if (!key.endsWith('.index')) throw new Error('keystore unavailable'); secure.set(key, value); });
    await expect(saveChatDraft('alice', 'one', 'private')).rejects.toThrow('keystore unavailable');
    await clearChatLocalAccount('alice');
    expect(secure.size).toBe(0);
    expect(mocks.plainSet).not.toHaveBeenCalled();
  });
});

describe('conversation organization', () => {
  it('preserves concurrent changes and scopes pin/archive preferences to an account', async () => {
    await Promise.all([setConversationPreference('alice', 'one', { pinned: true }), setConversationPreference('alice', 'one', { archived: true })]);
    expect(await readConversationPreferences('alice')).toEqual({ one: { pinned: true, archived: true } });
    expect(await readConversationPreferences('bob')).toEqual({});
    await clearChatLocalAccount('alice');
    expect(await readConversationPreferences('alice')).toEqual({ one: { pinned: true, archived: true } });
  });
});
