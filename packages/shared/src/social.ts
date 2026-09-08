import { z } from 'zod';

export const profileAudienceSchema = z.enum(['everyone', 'friends', 'no_one']);
export type ProfileAudience = z.infer<typeof profileAudienceSchema>;

export const starredTargetTypeSchema = z.enum(['chat', 'friend', 'group', 'event']);
export type StarredTargetType = z.infer<typeof starredTargetTypeSchema>;

export const starredItemSchema = z.object({
  id: z.uuid(),
  targetType: starredTargetTypeSchema,
  targetId: z.string().min(1).max(160),
  label: z.string().trim().min(1).max(120),
  profileAudience: profileAudienceSchema,
  createdAt: z.iso.datetime(),
}).strict();
export type StarredItem = z.infer<typeof starredItemSchema>;

export const friendshipStatusSchema = z.enum(['pending', 'accepted', 'declined']);
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>;

export const friendSummarySchema = z.object({
  friendshipId: z.uuid(),
  profileId: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(80),
  avatarUrl: z.url().optional(),
  status: friendshipStatusSchema,
  direction: z.enum(['incoming', 'outgoing', 'friend']),
  createdAt: z.iso.datetime(),
}).strict();
export type FriendSummary = z.infer<typeof friendSummarySchema>;

export const groupRoleSchema = z.enum(['owner', 'admin', 'moderator', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

export const groupSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).default(''),
  avatarUrl: z.url().optional(),
  role: groupRoleSchema,
  memberCount: z.number().int().positive(),
  isVoiceActive: z.boolean().default(false),
  updatedAt: z.iso.datetime(),
}).strict();
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupMessageSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  senderId: z.string().min(1).max(128),
  senderName: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2_000),
  createdAt: z.iso.datetime(),
}).strict();
export type GroupMessage = z.infer<typeof groupMessageSchema>;

export const groupVoiceSessionSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  startedBy: z.string().min(1).max(128),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  participantCount: z.number().int().nonnegative(),
}).strict();
export type GroupVoiceSession = z.infer<typeof groupVoiceSessionSchema>;

export const profileReactionEmojis = ['❤️', '🔥', '😊', '👏', '🏳️‍🌈'] as const;
export const profileReactionEmojiSchema = z.enum(profileReactionEmojis);
export type ProfileReactionEmoji = z.infer<typeof profileReactionEmojiSchema>;

export const profileReactionCountSchema = z.object({
  emoji: profileReactionEmojiSchema,
  count: z.number().int().nonnegative(),
  reactedByViewer: z.boolean(),
}).strict();
export type ProfileReactionCount = z.infer<typeof profileReactionCountSchema>;
