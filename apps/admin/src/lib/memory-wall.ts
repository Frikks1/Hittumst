import type { SupabaseClient } from '@supabase/supabase-js';
import {
  memoryCaptionSchema, memoryCommentBodySchema, memoryCommentSchema,
  memoryUploadReservationSchema, memoryWallSchema, memoryWallSettingsSchema,
  type MemoryComment, type MemoryWall, type MemoryWallSettings,
} from '@rummal/shared';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
export const memoryMediaAccept = [...imageTypes, ...videoTypes].join(',');

export function validateMemoryFile(file: Pick<File, 'type' | 'size'>): 'photo' | 'video' {
  const kind = imageTypes.has(file.type) ? 'photo' : videoTypes.has(file.type) ? 'video' : null;
  if (!kind) throw new Error('invalid_media_type');
  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('invalid_media_size');
  return kind;
}

/** A publishable client reads the public projection; Storage independently checks every path. */
export async function loadMemoryWall(db: SupabaseClient, meetupId: string, offset = 0): Promise<MemoryWall | null> {
  const { data, error } = await db.rpc('get_meetup_memory_wall', { p_meetup_id: meetupId, p_limit: 30, p_offset: offset });
  if (error) throw error;
  if (!data) return null;
  const wall = memoryWallSchema.parse(data);
  if (wall.meetupId !== meetupId) throw new Error('invalid_memory_wall');
  // Disabled walls never sign or render media, including any stale response payload.
  if (!wall.settings.enabled) return { ...wall, posts: [], hasMore: false };
  const paths = [...new Set(wall.posts.flatMap(post => [post.storagePath, post.posterPath].filter((path): path is string => Boolean(path))))];
  if (!paths.length) return { ...wall, posts: wall.posts.map(post => ({ ...post, url: undefined, posterUrl: undefined })) };
  const signed = await db.storage.from('meetup-media').createSignedUrls(paths, 300);
  // Do not trust attachment URLs in RPC data or fall back to public bucket URLs.
  const urls = new Map(signed.error ? [] : (signed.data ?? []).flatMap(row => row.path && row.signedUrl && !row.error ? [[row.path, row.signedUrl] as const] : []));
  return { ...wall, posts: wall.posts.map(post => ({ ...post, url: post.storagePath ? urls.get(post.storagePath) : undefined, posterUrl: post.posterPath ? urls.get(post.posterPath) : undefined })) };
}

export async function loadMemoryComments(db: SupabaseClient, postId: string, offset = 0): Promise<MemoryComment[]> {
  const { data, error } = await db.rpc('list_meetup_memory_comments', { p_post_id: postId, p_limit: 50, p_offset: offset });
  if (error) throw error;
  const comments = memoryCommentSchema.array().parse(data ?? []);
  if (comments.some(comment => comment.postId !== postId)) throw new Error('invalid_memory_comments');
  return comments;
}

export async function runMemoryMutation(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) throw new Error('authentication_required');
  const result = await db.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}

export async function saveMemoryWall(db: SupabaseClient, meetupId: string, settings: MemoryWallSettings) {
  return runMemoryMutation(db, 'update_meetup_memory_wall', { p_meetup_id: meetupId, p_settings: memoryWallSettingsSchema.parse(settings) });
}

export async function addMemoryComment(db: SupabaseClient, postId: string, body: string) {
  return runMemoryMutation(db, 'add_meetup_memory_comment', { p_post_id: postId, p_body: memoryCommentBodySchema.parse(body) });
}

/** Originals stay in quarantine until the media worker publishes an approved attachment. */
export async function uploadMemory(db: SupabaseClient, meetupId: string, file: File, caption: string) {
  const kind = validateMemoryFile(file);
  const reservation = memoryUploadReservationSchema.parse(await runMemoryMutation(db, 'reserve_meetup_memory', {
    p_meetup_id: meetupId, p_kind: kind, p_caption: memoryCaptionSchema.parse(caption),
  }));
  const uploaded = await db.storage.from(reservation.bucket).upload(reservation.path, file, { contentType: file.type, upsert: false, cacheControl: '0' });
  if (uploaded.error) {
    try { await db.rpc('cancel_media_upload', { upload_id: reservation.id }); }
    catch { /* Preserve the original upload error if cancellation is unavailable. */ }
    throw uploaded.error;
  }
}
