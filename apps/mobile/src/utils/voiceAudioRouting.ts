export type VoiceAudioOutput = 'bluetooth' | 'headset' | 'earpiece' | 'speaker';
export type VoiceAudioRouting = { bluetoothAllowed: boolean; preferredOutputList: VoiceAudioOutput[] };

/** Bluetooth is optional; microphone permission is checked separately before calling this. */
export async function resolveVoiceAudioRouting(
  platform: string,
  version: string | number,
  requestBluetooth: () => Promise<string>,
): Promise<VoiceAudioRouting> {
  let bluetoothAllowed = true;
  if (platform === 'android' && Number(version) >= 31) {
    try { bluetoothAllowed = (await requestBluetooth()) === 'granted'; }
    catch { bluetoothAllowed = false; }
  }
  return {
    bluetoothAllowed,
    preferredOutputList: bluetoothAllowed
      ? ['bluetooth', 'headset', 'earpiece', 'speaker']
      : ['headset', 'earpiece', 'speaker'],
  };
}
