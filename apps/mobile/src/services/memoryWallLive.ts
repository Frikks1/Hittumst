import { z } from 'zod';
import {
  memoryWallSchema, memoryWallSettingsSchema, memoryCaptionSchema, memoryCommentBodySchema,
  memoryCommentSchema, memoryKindSchema, memoryUploadReservationSchema, type MemoryPost, type MemoryWallSettings,
} from '@rummal/shared';
import { communityRpc, type CommunityRpc } from './communityLive';
import { supabase } from './supabase';
import { validateMemoryMedia, type MemoryWallApi } from './memoryWallTypes';

export type MemoryWallTransport = {
  sign(posts: MemoryPost[]): Promise<MemoryPost[]>;
  read(uri: string): Promise<ArrayBuffer>;
  upload(bucket: string, path: string, payload: ArrayBuffer, mimeType: string): Promise<void>;
};
const transport: MemoryWallTransport = {
  async sign(posts) {
    const paths = [...new Set(posts.flatMap(post => [post.storagePath, post.posterPath].filter((path): path is string => Boolean(path))))];
    if (!paths.length || !supabase) return posts.map(post => ({ ...post, url: undefined, posterUrl: undefined }));
    const { data, error } = await supabase.storage.from('meetup-media').createSignedUrls(paths, 300);
    const urls = new Map(error ? [] : (data ?? []).flatMap(row => !row.error && row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : []));
    return posts.map(post => ({ ...post, url: post.storagePath ? urls.get(post.storagePath) : undefined,
      posterUrl: post.posterPath ? urls.get(post.posterPath) : undefined }));
  },
  async read(uri) { return (await fetch(uri)).arrayBuffer(); },
  async upload(bucket, path, payload, mimeType) {
    if (!supabase) throw new Error('memory_wall_unavailable');
    const { error } = await supabase.storage.from(bucket).upload(path, payload, { contentType: mimeType, upsert: false, cacheControl: '0' });
    if (error) throw new Error(error.message);
  },
};
const page = (limit: number, offset: number, maximum: number) => ({
  p_limit: z.number().int().min(1).max(maximum).parse(limit),
  p_offset: z.number().int().min(0).max(10000).parse(offset),
});

/** Only approved paths from the wall RPC are signed; Storage checks visibility again. */
export class LiveMemoryWallApi implements MemoryWallApi {
  constructor(private readonly rpc: CommunityRpc = communityRpc, private readonly media: MemoryWallTransport = transport) {}
  async getWall(id: string, limit = 30, offset = 0) {
    const wall = memoryWallSchema.parse(await this.rpc('get_meetup_memory_wall', { p_meetup_id: id, ...page(limit, offset, 50) }));
    if (wall.meetupId !== id) throw new Error('invalid_memory_wall');
    if (!wall.settings.enabled) return { ...wall, posts: [], hasMore: false };
    return { ...wall, posts: await this.media.sign(wall.posts) };
  }
  async updateSettings(id: string, settings: MemoryWallSettings) {
    await this.rpc('update_meetup_memory_wall', { p_meetup_id: id, p_settings: memoryWallSettingsSchema.parse(settings) });
  }
  async upload(id: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string) {
    const parsedKind = memoryKindSchema.parse(kind);
    const parsedCaption = memoryCaptionSchema.parse(caption);
    validateMemoryMedia(parsedKind, mimeType);
    const payload = await this.media.read(uri);
    validateMemoryMedia(parsedKind, mimeType, payload.byteLength);
    const reservation = memoryUploadReservationSchema.parse(
      await this.rpc('reserve_meetup_memory', { p_meetup_id: id, p_kind: parsedKind, p_caption: parsedCaption }),
    );
    try { await this.media.upload(reservation.bucket, reservation.path, payload, mimeType); }
    catch (error) {
      // Preserve the upload error if cancellation itself is temporarily unavailable.
      await this.rpc('cancel_media_upload', { upload_id: reservation.id }).catch(() => undefined);
      throw error;
    }
  }
  async setLike(postId: string, liked: boolean) {
    await this.rpc('set_meetup_memory_like', { p_post_id: postId, p_liked: z.boolean().parse(liked) });
  }
  async listComments(postId: string, limit = 50, offset = 0) {
    const comments = z.array(memoryCommentSchema).parse(await this.rpc('list_meetup_memory_comments', { p_post_id: postId, ...page(limit, offset, 50) }));
    if (comments.some(comment => comment.postId !== postId)) throw new Error('invalid_memory_comments');
    return comments;
  }
  async addComment(postId: string, body: string) {
    await this.rpc('add_meetup_memory_comment', { p_post_id: postId, p_body: memoryCommentBodySchema.parse(body) });
  }
  async deleteComment(commentId: string) { await this.rpc('delete_meetup_memory_comment', { p_comment_id: commentId }); }
  async deletePost(postId: string) { await this.rpc('delete_meetup_memory', { p_post_id: postId }); }
  async pinPost(postId: string, pinned: boolean) {
    await this.rpc('pin_meetup_memory', { p_post_id: postId, p_pinned: z.boolean().parse(pinned) });
  }
}
