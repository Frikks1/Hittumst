import type {
  CommunityState, CommunityFollowTarget, MeetupSummary, CommunityApplicationInput, CommunityApplication,
  CommunityWaitlistAction, CommunityAnnouncement, CommunityAnnouncementAudience, CommunityFeedback,
  CommunityHostSummary, CommunityAttendanceCode, CommunityAttendanceHistoryItem,
} from '@rummal/shared';

export interface CommunityApi {
  getState(id: string): Promise<CommunityState>;
  setFollow(type: CommunityFollowTarget, id: string, following: boolean, notifications?: boolean): Promise<void>;
  listFollowing(): Promise<MeetupSummary[]>;
  setCover(id: string, mediaId: string | null): Promise<void>;
  setQuestions(id: string, questions: string[]): Promise<void>;
  apply(id: string, input: CommunityApplicationInput): Promise<void>;
  listApplications(id: string): Promise<CommunityApplication[]>;
  decideApplication(id: string, profileId: string, approve: boolean): Promise<void>;
  waitlistAction(id: string, action: CommunityWaitlistAction): Promise<void>;
  listAnnouncements(id: string): Promise<CommunityAnnouncement[]>;
  publishAnnouncement(id: string, audience: CommunityAnnouncementAudience, body: string): Promise<void>;
  listMyAttendance(): Promise<CommunityAttendanceHistoryItem[]>;
  getFeedback(id: string): Promise<CommunityFeedback>;
  recommend(id: string, recommended: boolean, body?: string): Promise<void>;
  deleteRecommendation(id: string): Promise<void>;
  getHostSummary(id: string): Promise<CommunityHostSummary>;
  createAttendanceCode(id: string): Promise<CommunityAttendanceCode>;
  recordAttendance(id: string, code: string): Promise<void>;
  requestAttendanceReview(id: string, reason: string): Promise<void>;
}
