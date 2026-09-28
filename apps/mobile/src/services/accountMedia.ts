import { z } from 'zod';
import { runtimeEnv } from './env';
import { supabase } from './supabase';
import { saveExportFile } from '@/utils/accountExport';

const mediaItemSchema = z.object({
  id: z.string().uuid(),
  bucket: z.enum(['album-media', 'profile-photos', 'profile-videos', 'message-images', 'meetup-media']),
  name: z.string().min(1),
  bytes: z.number().nonnegative().nullable().optional(),
});
export type AccountMediaItem = z.infer<typeof mediaItemSchema>;
export function readAccountMediaManifest(json: string): AccountMediaItem[] {
  return z.object({ mediaManifest: z.array(mediaItemSchema).default([]) }).parse(JSON.parse(json)).mediaManifest;
}

/** Never use a URL from export data as the recipient of the member's bearer token. */
export function accountMediaUrl(id: string, origin = runtimeEnv.websiteUrl): string {
  if (!origin || !z.string().uuid().safeParse(id).success) throw new Error('media_export_unavailable');
  const parsed = new URL(origin);
  const local = runtimeEnv.appEnvironment === 'development' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.port === '3001';
  if ((!local && (parsed.protocol !== 'https:' || parsed.port)) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('media_export_unavailable');
  return `${parsed.origin}/api/account/media/${id}`;
}
export async function saveAccountMedia(item: AccountMediaItem): Promise<void> {
  const parsed = mediaItemSchema.parse(item);
  const url = accountMediaUrl(parsed.id);
  const session = await supabase?.auth.getSession();
  if (!session?.data.session || session.error) throw new Error('authentication_required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.data.session.access_token}` }, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('media_export_unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A sign-out or account switch while bytes arrive must not open a share sheet for the previous member.
    const current = await supabase?.auth.getSession();
    if (!current?.data.session || current.error || current.data.session.user.id !== session.data.session.user.id) throw new Error('authentication_required');
    const extension = /\.(jpg|jpeg|png|webp|mp4|mov|webm)$/i.exec(parsed.name)?.[1]?.toLowerCase() ?? 'bin';
    const mime: Record<string, string> = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm' };
    await saveExportFile(bytes, `hittumst-${parsed.id}.${extension}`, mime[extension] ?? 'application/octet-stream');
  } finally { clearTimeout(timeout); }
}
