import { z } from 'zod';

const count = z.number().int().nonnegative();
export const communityCoverSchema = z.object({
  id: z.string(), kind: z.enum(['photo', 'video']),
  storagePath: z.string().optional(), posterPath: z.string().nullable().optional(),
  url: z.string().optional(), posterUrl: z.string().optional(),
});
export type CommunityCover = z.infer<typeof communityCoverSchema>;
export const communityFollowTargetSchema = z.enum(['host', 'event', 'series']);
export type CommunityFollowTarget = z.infer<typeof communityFollowTargetSchema>;
export const communityFollowStateSchema = z.object({ count, following: z.boolean(), notifications: z.boolean() });
export type CommunityFollowState = z.infer<typeof communityFollowStateSchema>;
export const communityFollowsSchema = z.object({
  event: communityFollowStateSchema, host: communityFollowStateSchema, series: communityFollowStateSchema.nullable(),
});
export const communityApplicationInputSchema = z.object({
  introduction: z.string().trim().min(1).max(1000),
  answers: z.array(z.string().trim().max(1000)).max(2),
  rulesAccepted: z.literal(true),
}).strict();
export type CommunityApplicationInput = z.infer<typeof communityApplicationInputSchema>;
export const communityQuestionsSchema = z.array(z.string().trim().min(1).max(200)).max(2);
export const communityApplicationSchema = z.object({
  profileId: z.string(), displayName: z.string(), introduction: z.string(),
  answers: z.array(z.string()), rulesAccepted: z.boolean(),
  status: z.enum(['pending', 'approved', 'declined', 'waitlisted', 'offered', 'joined']),
  createdAt: z.string(),
});
export type CommunityApplication = z.infer<typeof communityApplicationSchema>;
export const communityWaitlistSchema = z.object({
  status: z.enum(['waiting', 'offered']), position: count.nullable(), offerExpiresAt: z.string().nullable(),
});
export type CommunityWaitlistAction = 'join' | 'leave' | 'accept' | 'decline';
export const communityStateSchema = z.object({
  meetupId: z.string(), cover: communityCoverSchema.nullable(), follows: communityFollowsSchema,
  canApply: z.boolean(), canJoinWaitlist: z.boolean(), coverMediaId: z.string().nullable().optional(),
  applicationQuestions: z.array(z.string()), ownApplication: communityApplicationSchema.nullable(),
  waitlist: communityWaitlistSchema.nullable(),
});
export type CommunityState = z.infer<typeof communityStateSchema>;
export const communityAnnouncementAudienceSchema = z.enum(['followers', 'participants']);
export type CommunityAnnouncementAudience = z.infer<typeof communityAnnouncementAudienceSchema>;
export const communityAnnouncementBodySchema = z.string().trim().min(1).max(4000);
export const communityAnnouncementSchema = z.object({
  id: z.string(), meetupId: z.string(), body: z.string(),
  audience: communityAnnouncementAudienceSchema, createdAt: z.string(),
});
export type CommunityAnnouncement = z.infer<typeof communityAnnouncementSchema>;
export const communityReputationSchema = z.object({
  positive: count, negative: count, total: count, legacyCount: count,
  legacyAverage: z.number().min(1).max(5).nullable(),
});
export type CommunityReputation = z.infer<typeof communityReputationSchema>;
export const communityRecommendationInputSchema = z.object({ recommended: z.boolean(), body: z.string().trim().max(2000) }).strict();
export const communityReviewSchema = z.object({
  id: z.string(), body: z.string(), createdAt: z.string(), legacyRating: z.number().min(1).max(5).nullable(),
});
export type CommunityReview = z.infer<typeof communityReviewSchema>;
export const communityFeedbackSchema = z.object({
  summary: communityReputationSchema, reviews: z.array(communityReviewSchema), canReview: z.boolean(),
  ownReview: communityRecommendationInputSchema.nullable(),
  attendanceReviewStatus: z.enum(['pending', 'approved', 'rejected']).nullable(),
  seriesSummary: communityReputationSchema.nullable(),
});
export type CommunityFeedback = z.infer<typeof communityFeedbackSchema>;
export const communityPastGatheringSchema = z.object({
  id: z.string(), title: z.string(), startsAt: z.string(), cover: communityCoverSchema.nullable(), feedback: communityReputationSchema,
});
export type CommunityPastGathering = z.infer<typeof communityPastGatheringSchema>;
export const communityAttendanceCodeSchema = z.object({ code: z.string().min(1), expiresAt: z.string() });
export type CommunityAttendanceCode = z.infer<typeof communityAttendanceCodeSchema>;
export const communityAttendanceReviewReasonSchema = z.string().trim().min(20).max(2000);
export const communityAttendanceReviewSchema = z.object({
  id: z.string(), meetupId: z.string(), meetupTitle: z.string(), profileId: z.string(), displayName: z.string(),
  reason: z.string(), status: z.enum(['pending', 'approved', 'rejected']), createdAt: z.string(),
});
export type CommunityAttendanceReview = z.infer<typeof communityAttendanceReviewSchema>;

export const communityAttendanceHistoryItemSchema = z.object({ meetupId: z.string(), title: z.string(), effectiveEnd: z.string(), canReview: z.boolean() });
export type CommunityAttendanceHistoryItem = z.infer<typeof communityAttendanceHistoryItemSchema>;
