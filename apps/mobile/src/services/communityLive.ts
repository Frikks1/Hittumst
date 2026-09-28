import {
  communityStateSchema, communityApplicationInputSchema, communityQuestionsSchema,
  communityApplicationSchema, communityAnnouncementSchema, communityAnnouncementBodySchema,
  communityFeedbackSchema, communityRecommendationInputSchema, communityHostSummarySchema,
  communityAttendanceCodeSchema, communityAttendanceReviewReasonSchema, communityFollowTargetSchema,
  communityAnnouncementAudienceSchema, communityAttendanceHistoryItemSchema,
  type CommunityFollowTarget, type CommunityApplicationInput, type CommunityWaitlistAction,
  type CommunityAnnouncementAudience,
} from '@rummal/shared';
import { z } from 'zod';
import type { CommunityApi } from './communityTypes';
import { supabase } from './supabase';
import { parseMeetupSummaries } from './meetupLive';
import { signCommunityCovers } from './communityMedia';

export type CommunityRpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
export const communityRpc: CommunityRpc = async (name, args = {}) => {
  if (!supabase) throw new Error('community_unavailable');
  // This boundary is deliberately narrow; every returned object is validated below.
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
};
export class LiveCommunityApi implements CommunityApi {
  constructor(private readonly rpc: CommunityRpc = communityRpc) {}
  async getState(id: string) {
    const state = communityStateSchema.parse(await this.rpc('community_get_state', { p_meetup_id: id }));
    const [cover] = await signCommunityCovers([state.cover]);
    return { ...state, cover: cover ?? null };
  }
  async setFollow(type: CommunityFollowTarget, id: string, following: boolean, notifications = true) {
    await this.rpc('community_set_follow', { p_target_type: communityFollowTargetSchema.parse(type), p_target_id: id, p_following: following, p_notifications: notifications });
  }
  async listFollowing() { return parseMeetupSummaries(await this.rpc('community_list_following')); }
  async setCover(id: string, mediaId: string | null) { await this.rpc('community_set_cover', { p_meetup_id: id, p_media_id: mediaId }); }
  async setQuestions(id: string, questions: string[]) { await this.rpc('community_set_questions', { p_meetup_id: id, p_questions: communityQuestionsSchema.parse(questions) }); }
  async apply(id: string, input: CommunityApplicationInput) {
    const parsed = communityApplicationInputSchema.parse(input);
    await this.rpc('community_apply', { p_meetup_id: id, p_introduction: parsed.introduction, p_answers: parsed.answers, p_rules_accepted: parsed.rulesAccepted });
  }
  async listApplications(id: string) { return z.array(communityApplicationSchema).parse(await this.rpc('community_list_applications', { p_meetup_id: id })); }
  async decideApplication(id: string, profileId: string, approve: boolean) { await this.rpc('community_decide_application', { p_meetup_id: id, p_profile_id: profileId, p_approve: approve }); }
  async waitlistAction(id: string, action: CommunityWaitlistAction) { await this.rpc('community_waitlist_action', { p_meetup_id: id, p_action: z.enum(['join', 'leave', 'accept', 'decline']).parse(action) }); }
  async listAnnouncements(id: string) { return z.array(communityAnnouncementSchema).parse(await this.rpc('community_list_announcements', { p_meetup_id: id })); }
  async publishAnnouncement(id: string, audience: CommunityAnnouncementAudience, body: string) {
    await this.rpc('community_publish_announcement', { p_meetup_id: id, p_audience: communityAnnouncementAudienceSchema.parse(audience), p_body: communityAnnouncementBodySchema.parse(body) });
  }
  async listMyAttendance() { return z.array(communityAttendanceHistoryItemSchema).parse(await this.rpc('list_my_community_attendance')); }
  async getFeedback(id: string) { return communityFeedbackSchema.parse(await this.rpc('get_meetup_community_feedback', { p_meetup_id: id })); }
  async recommend(id: string, recommended: boolean, body = '') {
    const parsed = communityRecommendationInputSchema.parse({ recommended, body });
    await this.rpc('save_meetup_recommendation', { p_meetup_id: id, p_recommended: parsed.recommended, p_body: parsed.body });
  }
  async deleteRecommendation(id: string) { await this.rpc('delete_meetup_recommendation', { p_meetup_id: id }); }
  async getHostSummary(id: string) {
    const raw = await this.rpc('get_host_community_summary', { p_host_id: id });
    const record = z.object({ upcomingGatherings: z.array(z.unknown()) }).passthrough().parse(raw);
    const parsed = communityHostSummarySchema.parse({ ...record, upcomingGatherings: await parseMeetupSummaries(record.upcomingGatherings) });
    const covers = await signCommunityCovers(parsed.pastGatherings.map(item => item.cover));
    return { ...parsed, pastGatherings: parsed.pastGatherings.map((item, index) => ({ ...item, cover: covers[index] ?? null })) };
  }
  async createAttendanceCode(id: string) { return communityAttendanceCodeSchema.parse(await this.rpc('create_meetup_attendance_code', { p_meetup_id: id })); }
  async recordAttendance(id: string, code: string) { await this.rpc('record_meetup_attendance', { p_meetup_id: id, p_code: z.string().trim().min(1).max(200).parse(code) }); }
  async requestAttendanceReview(id: string, reason: string) { await this.rpc('request_meetup_attendance_review', { p_meetup_id: id, p_reason: communityAttendanceReviewReasonSchema.parse(reason) }); }
}
