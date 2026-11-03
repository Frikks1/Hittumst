import { z } from 'zod';

export const memoryWallSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  layout: z.enum(['grid', 'feed']),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
}).strict();
export type MemoryWallSettings = z.infer<typeof memoryWallSettingsSchema>;
export const defaultMemoryWallSettings: MemoryWallSettings = {
  enabled: false, title: 'Wall of memories', description: '', layout: 'grid', accentColor: '#C65A3A',
};
export const memoryCaptionSchema = z.string().trim().max(2000);
export const memoryCommentBodySchema = z.string().trim().min(1).max(2000);
export const memoryKindSchema = z.enum(['photo', 'video']);
export const memoryUploadReservationSchema = z.object({
  id: z.string(), path: z.string(), bucket: z.literal('media-quarantine'),
});
export const memoryPostSchema = z.object({
  id: z.string(), meetupId: z.string(), authorId: z.string().nullable(), authorName: z.string(),
  kind: memoryKindSchema, storagePath: z.string().optional(), url: z.string().optional(),
  posterPath: z.string().nullable().optional(), posterUrl: z.string().optional(),
  caption: z.string(), createdAt: z.string(),
  likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative(),
  likedByViewer: z.boolean(), pinned: z.boolean(), canDelete: z.boolean(),
});
export type MemoryPost = z.infer<typeof memoryPostSchema>;
export const memoryCommentSchema = z.object({
  id: z.string(), postId: z.string(), authorId: z.string().nullable(), authorName: z.string(),
  body: z.string(), createdAt: z.string(), canDelete: z.boolean(),
});
export type MemoryComment = z.infer<typeof memoryCommentSchema>;
export const memoryWallSchema = z.object({
  meetupId: z.string(), meetupTitle: z.string(), settings: memoryWallSettingsSchema,
  canPost: z.boolean(), canManage: z.boolean(), canInteract: z.boolean(),
  posts: z.array(memoryPostSchema), hasMore: z.boolean(),
});
export type MemoryWall = z.infer<typeof memoryWallSchema>;
