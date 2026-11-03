import { z } from 'zod';

/** Only room metadata and authorized message previews; never venue details or a roster. */
export const meetupChatSummarySchema = z.object({
  id: z.uuid(),
  meetupId: z.uuid(),
  title: z.string().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  avatarUrl: z.url().optional(),
  lastMessage: z.string().max(2000).optional(),
  lastMessageKind: z.enum(['text', 'system', 'photo', 'video', 'poll']).optional(),
  lastMessageAt: z.iso.datetime({ offset: true }).optional(),
  unreadCount: z.number().int().nonnegative(),
  canPost: z.boolean(),
  isPaused: z.boolean(),
  muted: z.boolean().optional(),
}).strict();
export type MeetupChatSummary = z.infer<typeof meetupChatSummarySchema>;
