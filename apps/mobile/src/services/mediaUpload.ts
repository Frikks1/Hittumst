import { supabase } from './supabase';
export type MediaTarget = 'profile_photo' | 'profile_video' | 'message' | 'meetup' | 'strax' | 'meetup_room_message' | 'meetup_room_avatar' | 'social_feed_post' | 'community_cover';
/** Quarantine originals. Only the server worker can publish a viewable attachment. */
export async function queueMediaUpload(targetType: MediaTarget, targetId: string, uri: string, kind: 'image' | 'video', mimeType: string, tags: string[] = [], clientMessageId?: string) {
  if (['strax', 'meetup_room_avatar', 'social_feed_post', 'community_cover'].includes(targetType) && kind !== 'image') throw new Error('invalid_media_type');
  const valid = kind === 'image' ? ['image/jpeg','image/png','image/webp', ...(targetType === 'profile_photo' ? ['image/gif'] : [])] : ['video/mp4','video/quicktime','video/webm'];
  if (!valid.includes(mimeType)) throw new Error('invalid_media_type');
  const payload = await (await fetch(uri)).arrayBuffer();
  const maximum = (targetType === 'profile_photo' || targetType === 'message' || targetType === 'strax' || targetType === 'social_feed_post' || targetType === 'community_cover' || targetType === 'meetup_room_avatar' || targetType === 'meetup_room_message' && kind === 'image' ? 10 : 50) * 1024 * 1024;
  if (!payload.byteLength || payload.byteLength > maximum) throw new Error('invalid_media_size');
  const response = await supabase!.rpc('reserve_media_upload', { target_type: targetType, target_id: targetId, media_type: kind, metadata: { tags, ...(clientMessageId ? { clientMessageId } : {}) } });
  if (response.error) throw response.error;
  const reservation = response.data as { id: string; path: string; bucket: string; alreadyUploaded?: boolean };
  if (['meetup_room_message', 'social_feed_post', 'community_cover'].includes(targetType) && reservation.alreadyUploaded) return reservation.id;
  const uploaded = await supabase!.storage.from(reservation.bucket).upload(reservation.path, payload, { contentType: mimeType, upsert: false, cacheControl: '0' });
  if (uploaded.error) {
    // A retried Strax reservation can refer to the original already-uploaded
    // quarantine object after a lost response. Leave that worker job intact.
    if ((['strax', 'social_feed_post', 'community_cover'].includes(targetType) || targetType === 'meetup_room_message' && clientMessageId) && String((uploaded.error as { statusCode?: unknown }).statusCode) === '409') return reservation.id;
    await supabase!.rpc('cancel_media_upload', { upload_id: reservation.id });
    throw uploaded.error;
  }
  return reservation.id;
}
