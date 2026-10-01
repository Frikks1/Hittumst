import { supabase } from './supabase';
export type MediaTarget = 'profile_photo' | 'profile_video' | 'message' | 'meetup' | 'group' | 'message_video';
export type MediaUploadScope = { accountId?: string; isCurrent?: () => boolean };
/** Quarantine originals. Only the server worker can publish a viewable attachment. */
export async function queueMediaUpload(targetType: MediaTarget, targetId: string, uri: string, kind: 'image' | 'video', mimeType: string, tags: string[] = [], metadata: Record<string, unknown> = {}, scope: MediaUploadScope = {}) {
  const valid = kind === 'image' ? ['image/jpeg','image/png','image/webp'] : ['video/mp4','video/quicktime','video/webm','image/gif'];
  if (!valid.includes(mimeType)) throw new Error('invalid_media_type');
  const session = await supabase?.auth.getSession();
  const owner = session?.data.session;
  if (session?.error || !owner || (scope.accountId && owner.user.id !== scope.accountId) || scope.isCurrent?.() === false) throw new Error('authentication_required');
  const authorization = `Bearer ${owner.access_token}`;
  const assertCurrent = async () => {
    const current = await supabase!.auth.getSession();
    if (current.error || current.data.session?.user.id !== owner.user.id || scope.isCurrent?.() === false) throw new Error('authentication_required');
  };
  const payload = await (await fetch(uri)).arrayBuffer();
  const maximum = (targetType === 'profile_photo' || targetType === 'message' ? 10 : 50) * 1024 * 1024;
  if (!payload.byteLength || payload.byteLength > maximum) throw new Error('invalid_media_size');
  await assertCurrent();
  // Pin every write to the initiating session. A later sign-in must never upload
  // the previous member's camera bytes using the new member's credentials.
  const response = await supabase!.rpc('reserve_media_upload', { target_type: targetType, target_id: targetId, media_type: kind, metadata: { ...metadata, tags } }).setHeader('Authorization', authorization);
  if (response.error) throw response.error;
  const reservation = response.data as { id: string; path: string; bucket: string };
  try {
    await assertCurrent();
    const uploaded = await supabase!.storage.from(reservation.bucket).upload(reservation.path, payload, { contentType: mimeType, upsert: false, cacheControl: '0', headers: { Authorization: authorization } });
    if (uploaded.error) throw uploaded.error;
    await assertCurrent();
  } catch (error) {
    await supabase!.rpc('cancel_media_upload', { upload_id: reservation.id }).setHeader('Authorization', authorization);
    throw error;
  }
  return reservation.id;
}
