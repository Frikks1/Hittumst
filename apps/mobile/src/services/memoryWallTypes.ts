import type { MemoryComment, MemoryWall, MemoryWallSettings } from '@rummal/shared';

export interface MemoryWallApi {
  getWall(id: string, limit?: number, offset?: number): Promise<MemoryWall>;
  updateSettings(id: string, settings: MemoryWallSettings): Promise<void>;
  upload(id: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string): Promise<void>;
  setLike(postId: string, liked: boolean): Promise<void>;
  listComments(postId: string, limit?: number, offset?: number): Promise<MemoryComment[]>;
  addComment(postId: string, body: string): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
  deletePost(postId: string): Promise<void>;
  pinPost(postId: string, pinned: boolean): Promise<void>;
}

export function validateMemoryMedia(kind: 'photo' | 'video', mimeType: string, bytes?: number) {
  const allowed = kind === 'photo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/quicktime', 'video/webm'];
  if (!allowed.includes(mimeType)) throw new Error('invalid_media_type');
  if (bytes !== undefined && (!bytes || bytes > 50 * 1024 * 1024)) throw new Error('invalid_media_size');
}
