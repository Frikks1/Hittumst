import { z } from 'zod';
import { publicCommunitySchema } from '@rummal/shared';
export const staffCommunityDirectorySchema = z.array(publicCommunitySchema);
export const feedModerationInputSchema = z.object({
  kind: z.enum(['post', 'comment']),
  id: z.uuid(),
  hidden: z.boolean(),
  reason: z.string().trim().min(8).max(1000),
});
export const feedReportQueueSchema = z.array(
  z.object({
    id: z.uuid(),
    category: z.string(),
    details: z.string(),
    status: z.string(),
    created_at: z.string(),
    social_feed_post_id: z.uuid().nullable(),
    social_feed_comment_id: z.uuid().nullable(),
    social_feed_snapshot: z
      .object({
        id: z.string(),
        kind: z.enum(['post', 'comment']),
        body: z.string(),
        imagePath: z.string().nullable().optional(),
        capturedAt: z.string(),
      })
      .passthrough(),
  }),
);
export const communityCoverReservationSchema = z.object({
  id: z.uuid(),
  bucket: z.literal('media-quarantine'),
  path: z.string(),
  alreadyUploaded: z.boolean().optional(),
});
