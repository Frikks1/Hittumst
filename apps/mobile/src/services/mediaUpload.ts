import { supabase } from './supabase';
export type MediaTarget = 'profile_photo' | 'profile_video' | 'message' | 'meetup';
/** Quarantine originals. Only the server worker can publish a viewable attachment. */
export async function queueMediaUpload(targetType: MediaTarget, targetId: string, uri: string, kind: 'image' | 'video', mimeType: string, tags: string[] = []) {
  const valid = kind === 'image' ? ['image/jpeg','image/png','image/webp'] : ['video/mp4','video/quicktime','video/webm'];
  if (!valid.includes(mimeType)) throw new Error('invalid_media_type');
  const payload = await (await fetch(uri)).arrayBuffer();
  const maximum = (targetType === 'profile_photo' || targetType === 'message' ? 10 : 50) * 1024 * 1024;
  if (!payload.byteLength || payload.byteLength > maximum) throw new Error('invalid_media_size');
  const response = await supabase!.rpc('reserve_media_upload', { target_type: targetType, target_id: targetId, media_type: kind, metadata: { tags } });
  if (response.error) throw response.error;
  const reservation = response.data as { id: string; path: string; bucket: string };
  const uploaded = await supabase!.storage.from(reservation.bucket).upload(reservation.path, payload, { contentType: mimeType, upsert: false, cacheControl: '0' });
  if (uploaded.error) {
    await supabase!.rpc('cancel_media_upload', { upload_id: reservation.id });
    throw uploaded.error;
  }
  return reservation.id;
}
