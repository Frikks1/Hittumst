import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RummalApi } from '@/services/types';
import { defaultNotificationPreferences } from '@/services/notificationPreferences';
import { DemoMeetupService } from '@/services/meetupDemo';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  scheduled: new Map<string, { identifier: string; content: { data: Record<string, string> } }>(),
  userId: 'member-one' as string | null,
  getPermissions: vi.fn(), requestPermissions: vi.fn(), schedule: vi.fn(), cancel: vi.fn(),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/services', () => ({ authService: { getUser: async () => mocks.userId ? { id: mocks.userId } : null } }));
vi.mock('expo-constants', () => ({ default: { executionEnvironment: 'standalone' } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.storage.set(key, value); },
  removeItem: async (key: string) => { mocks.storage.delete(key); },
  getAllKeys: async () => [...mocks.storage.keys()],
  multiRemove: async (keys: string[]) => { keys.forEach(key => mocks.storage.delete(key)); },
} }));
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: mocks.getPermissions, requestPermissionsAsync: mocks.requestPermissions,
  scheduleNotificationAsync: mocks.schedule, cancelScheduledNotificationAsync: mocks.cancel,
  getAllScheduledNotificationsAsync: async () => [...mocks.scheduled.values()],
  setNotificationChannelAsync: async () => undefined,
  AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import { cancelAllMeetupReminders, getMeetupReminder, reconcileMeetupReminder, reconcileMeetupReminders, setMeetupReminder } from './eventReminders.native';

const id = '9f433726-18df-41bd-96a1-e9ec1b503a02';
async function fixture() {
  const service = new DemoMeetupService(new Date());
  await service.join(id);
  const detail = await service.get(id);
  const getPreferences = vi.fn().mockResolvedValue({ ...defaultNotificationPreferences });
  const getMeetup = vi.fn().mockResolvedValue(detail);
  const api = { getNotificationPreferences: getPreferences, getMeetup } as unknown as RummalApi;
  return { detail, api, getPreferences, getMeetup, service };
}

describe('native meetup reminder lifecycle', () => {
  beforeEach(async () => {
    mocks.userId = 'member-one';
    mocks.cancel.mockReset().mockImplementation(async (requestId: string) => { mocks.scheduled.delete(requestId); });
    await cancelAllMeetupReminders();
    mocks.getPermissions.mockReset().mockResolvedValue({ status: 'granted' });
    mocks.requestPermissions.mockReset().mockResolvedValue({ status: 'granted' });
    mocks.schedule.mockReset().mockImplementation(async ({ content }: { content: { data: Record<string, string> } }) => {
      const identifier = crypto.randomUUID();
      mocks.scheduled.set(identifier, { identifier, content }); return identifier;
    });
  });

  it('keeps the existing choice and schedule if changing it fails before replacement', async () => {
    const { detail, api, getPreferences } = await fixture();
    await setMeetupReminder(api, 'member-one', detail, 60, 'en');
    const old = [...mocks.scheduled.keys()];
    getPreferences.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(setMeetupReminder(api, 'member-one', detail, 15, 'en')).rejects.toThrow('network unavailable');
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: 60, status: 'scheduled' });
    expect([...mocks.scheduled.keys()]).toEqual(old);
  });

  it('suspends delivery on refresh failures while retaining the choice for a later retry', async () => {
    const { detail, api, getMeetup } = await fixture();
    await setMeetupReminder(api, 'member-one', detail, 60, 'en');
    getMeetup.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(reconcileMeetupReminders(api)).rejects.toThrow('network unavailable');
    expect(mocks.scheduled.size).toBe(0);
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: 60, status: 'unavailable' });
    await reconcileMeetupReminders(api);
    expect(mocks.scheduled.size).toBe(1);
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: 60, status: 'scheduled' });
  });

  it('keeps the previous choice if notification permission is denied for a replacement', async () => {
    const { detail, api } = await fixture();
    await setMeetupReminder(api, 'member-one', detail, 60, 'en');
    const old = [...mocks.scheduled.keys()];
    mocks.getPermissions.mockResolvedValue({ status: 'denied' });
    mocks.requestPermissions.mockResolvedValue({ status: 'denied' });
    await expect(setMeetupReminder(api, 'member-one', detail, 15, 'en')).rejects.toThrow('reminder_permission_required');
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: 60, status: 'scheduled' });
    expect([...mocks.scheduled.keys()]).toEqual(old);
  });

  it('uses just-saved event preferences to cancel delivery without fetching them again', async () => {
    const { detail, api, getPreferences } = await fixture();
    await setMeetupReminder(api, 'member-one', detail, 60, 'en');
    getPreferences.mockRejectedValue(new Error('preferences unavailable'));
    await reconcileMeetupReminders(api, { ...defaultNotificationPreferences, events: false });
    expect(getPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.scheduled.size).toBe(0);
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: 60, status: 'disabled' });
  });

  it('cancels delivery after admission or diagnosis access is lost even if preference loading fails', async () => {
    const { detail, api, getPreferences, service } = await fixture();
    await setMeetupReminder(api, 'member-one', detail, 60, 'en');
    getPreferences.mockRejectedValue(new Error('preferences unavailable'));
    await reconcileMeetupReminder(api, 'member-one', { ...detail, requiresDiagnosisVerification: true }, 'en');
    expect(mocks.scheduled.size).toBe(0);
    expect(await getMeetupReminder('member-one', id)).toEqual({ minutes: null, status: 'none' });
    await service.leave(id);
    await expect(setMeetupReminder(api, 'member-one', await service.get(id), 15, 'en')).resolves.toEqual({ minutes: null, status: 'none' });
  });

  it('cleans an in-flight schedule when the account signs out', async () => {
    const { detail, api } = await fixture();
    let resolve: (value: string) => void = () => undefined;
    mocks.schedule.mockImplementationOnce(({ content }: { content: { data: Record<string, string> } }) => new Promise<string>(done => {
      mocks.scheduled.set('in-flight', { identifier: 'in-flight', content }); resolve = done;
    }));
    const request = setMeetupReminder(api, 'member-one', detail, 60, 'en');
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalled());
    mocks.userId = null;
    const cleanup = cancelAllMeetupReminders();
    resolve('in-flight');
    await request; await cleanup;
    expect(mocks.scheduled.size).toBe(0);
    expect(mocks.storage.size).toBe(0);
  });

  it('does not revive queued choices after cleanup even when the same account returns', async () => {
    const { detail, api } = await fixture();
    let resolve: (value: string) => void = () => undefined;
    mocks.schedule.mockImplementationOnce(({ content }: { content: { data: Record<string, string> } }) => new Promise<string>(done => {
      mocks.scheduled.set('old-session', { identifier: 'old-session', content }); resolve = done;
    }));
    const first = setMeetupReminder(api, 'member-one', detail, 60, 'en');
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalled());
    const queued = setMeetupReminder(api, 'member-one', detail, 15, 'en');
    const cleanup = cancelAllMeetupReminders();
    resolve('old-session');
    await first; await queued; await cleanup;
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.scheduled.size).toBe(0);
    expect(mocks.storage.size).toBe(0);
  });
});
