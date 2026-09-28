import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';

/** Temporary native bytes are removed after the member dismisses the system save/share sheet. */
export async function saveExportFile(contents: string | Uint8Array, filename: string, mimeType: string): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) throw new Error('invalid_export_filename');
  if (Platform.OS === 'web') {
    const payload = typeof contents === 'string' ? contents : new Uint8Array(contents);
    const url = URL.createObjectURL(new Blob([payload], { type: mimeType }));
    const link = document.createElement('a');
    try {
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
    } finally {
      link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }
  const [{ File, Directory, Paths }, sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  if (!await sharing.isAvailableAsync()) throw new Error('file_sharing_unavailable');
  const directory = new Directory(Paths.cache, `hittumst-export-${randomUUID()}`);
  try {
    directory.create();
    const file = new File(directory, filename);
    file.write(contents);
    await sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Hittumst' });
  } finally {
    if (directory.exists) directory.delete();
  }
}

export async function saveAccountExport(json: string): Promise<void> {
  JSON.parse(json);
  await saveExportFile(json, 'hittumst-account.json', 'application/json');
}
