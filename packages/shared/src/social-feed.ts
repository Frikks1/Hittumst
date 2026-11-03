import { z } from 'zod';

const identifier = z.string().min(1);
export const communityAuthorSchema = z.object({
  id: identifier,
  displayName: z.string(),
  pronouns: z.string().nullable(),
  photoPath: z.string().nullable(),
  photoUrl: z.string().optional(),
  photoPosterUrl: z.string().optional(),
});
export const publicCommunitySchema = z.object({
  id: identifier,
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'archived', 'hidden']),
  memberCount: z.number().int().nonnegative(),
  joined: z.boolean(),
  coverPath: z.string().nullable(),
  coverUrl: z.string().optional(),
  createdAt: z.string(),
});
export const communityPostSchema = z.object({
  id: identifier,
  author: communityAuthorSchema,
  community: z.object({ id: identifier, name: z.string() }).nullable(),
  body: z.string(),
  createdAt: z.string(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  liked: z.boolean(),
  canDelete: z.boolean(),
  imageStatus: z.enum(['none', 'pending', 'approved', 'rejected']),
  imagePath: z.string().nullable(),
  imageUrl: z.string().optional(),
});
export const communityCommentSchema = z.object({
  id: identifier,
  postId: identifier,
  author: communityAuthorSchema,
  body: z.string(),
  createdAt: z.string(),
  canDelete: z.boolean(),
});
export const socialFeedPageSchema = z.object({
  items: z.array(communityPostSchema),
  nextCursor: z.string().nullable(),
});
export const communityCommentsPageSchema = z.object({
  items: z.array(communityCommentSchema),
  nextCursor: z.string().nullable(),
});
export const publishCommunityPostSchema = z.object({
  requestId: z.uuid(),
  communityId: z.uuid().nullable(),
  body: z.string().trim().min(1).max(2000),
});
export const publishCommunityCommentSchema = z.object({
  requestId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
});
export const staffCommunityInputSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000),
  status: z.enum(['active', 'archived', 'hidden']),
  reason: z.string().trim().min(8).max(1000),
});
export type PublicCommunity = z.infer<typeof publicCommunitySchema>;
export type CommunityPost = z.infer<typeof communityPostSchema>;
export type CommunityComment = z.infer<typeof communityCommentSchema>;
export type SocialFeedPage = z.infer<typeof socialFeedPageSchema>;
export type CommunityCommentsPage = z.infer<typeof communityCommentsPageSchema>;
export type PublishCommunityPost = z.infer<typeof publishCommunityPostSchema>;
export type PublishCommunityComment = z.infer<typeof publishCommunityCommentSchema>;
export type StaffCommunityInput = z.infer<typeof staffCommunityInputSchema>;
