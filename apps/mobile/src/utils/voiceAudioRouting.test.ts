import { describe, expect, it, vi } from 'vitest';
import { resolveVoiceAudioRouting } from './voiceAudioRouting';

describe('optional Android Bluetooth routing', () => {
  it.each([['android', 30], ['ios', '19.0']] as const)('does not request Android 12 permission on %s %s', async (platform, version) => {
    const request = vi.fn(async () => 'denied');
    const route = await resolveVoiceAudioRouting(platform, version, request);
    expect(request).not.toHaveBeenCalled();
    expect(route.bluetoothAllowed).toBe(true);
  });

  it('waits for Android 12+ consent before selecting Bluetooth routing', async () => {
    let complete!: (value: string) => void;
    const request = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
    const routing = resolveVoiceAudioRouting('android', 31, request);
    expect(request).toHaveBeenCalledOnce();
    complete('granted');
    expect(await routing).toEqual({ bluetoothAllowed: true, preferredOutputList: ['bluetooth', 'headset', 'earpiece', 'speaker'] });
  });

  it.each(['denied', 'never_ask_again'])('allows handset or wired audio when Bluetooth permission is %s', async result => {
    expect(await resolveVoiceAudioRouting('android', 36, async () => result))
      .toEqual({ bluetoothAllowed: false, preferredOutputList: ['headset', 'earpiece', 'speaker'] });
  });

  it('preserves a usable non-Bluetooth route when the permission bridge fails', async () => {
    await expect(resolveVoiceAudioRouting('android', 36, async () => { throw new Error('permission request unavailable'); }))
      .resolves.toEqual({ bluetoothAllowed: false, preferredOutputList: ['headset', 'earpiece', 'speaker'] });
  });
});
