import * as Crypto from 'expo-crypto';
import {
  communityApplicationInputSchema, communityQuestionsSchema, communityAnnouncementBodySchema,
  communityRecommendationInputSchema, communityAttendanceReviewReasonSchema, defaultMeetupFilters,
  type CommunityState, type CommunityFollowTarget, type CommunityFollowState, type CommunityApplicationInput,
  type CommunityApplication, type CommunityWaitlistAction, type CommunityAnnouncement,
  type CommunityAnnouncementAudience, type CommunityFeedback, type CommunityHostSummary,
  type CommunityCover, type MeetupSummary, type CommunityReputation, type MeetupDetail, type MeetupNotification,
} from '@rummal/shared';
import type { RummalApi } from './types';
import type { CommunityApi } from './communityTypes';

type Follow = { viewer: string; type: CommunityFollowTarget; target: string; notifications: boolean };
type Queue = { profileId: string; status: 'waiting' | 'offered'; createdAt: number; approved: boolean; expiresAt: number | null };
type Recommendation = { id: string; viewer: string; recommended: boolean; body: string; createdAt: string };
export type DemoCommunityBridge = {
  sponsored(id: string, profileId: string): boolean;
  feedbackEvent(id: string): Promise<MeetupDetail>;
  eligible(id: string, profileId: string): boolean;
  acceptOffer(id: string, approvedApplication: boolean): Promise<void>;
  all(): Promise<MeetupDetail[]>;
  host(id: string): Promise<{ displayName: string; profileVisible: boolean }>;
  participants(id: string): string[];
};
type DemoSource = RummalApi & { demoCommunityStore?: DemoCommunityStore; communityDemo?: DemoCommunityBridge };
export class DemoCommunityStore {
  covers = new Map<string, CommunityCover>();
  follows = new Map<string, Follow>();
  questions = new Map<string, string[]>();
  applications = new Map<string, Map<string, CommunityApplication>>();
  queues = new Map<string, Queue[]>();
  applicationRules = new Map<string, string>();
  announcements = new Map<string, CommunityAnnouncement[]>();
  recommendations = new Map<string, Map<string, Recommendation>>();
  receipts = new Map<string, Set<string>>();
  codes = new Map<string, { code: string; expiresAt: number }[]>();
  appeals = new Map<string, Map<string, 'pending' | 'approved' | 'rejected'>>();
  known = new Map<string, MeetupDetail>();
  notifications = new Map<string, MeetupNotification[]>();
  delivered = new Set<string>();
}
export const demoCommunityStore = new DemoCommunityStore();
const emptyReputation = (): CommunityReputation => ({ positive: 0, negative: 0, total: 0, legacyCount: 0, legacyAverage: null });
function followState(store: DemoCommunityStore, viewer: string, type: CommunityFollowTarget, target: string): CommunityFollowState {
  const rows = [...store.follows.values()].filter(row => row.type === type && row.target === target);
  const own = rows.find(row => row.viewer === viewer);
  return { count: rows.length, following: Boolean(own), notifications: own?.notifications ?? true };
}
export function decorateDemoCommunity<T extends MeetupSummary>(event: T, viewer = 'demo-me', store = demoCommunityStore): T {
  return { ...event, cover: store.covers.get(event.id) ?? null, follows: {
    event: followState(store, viewer, 'event', event.id), host: followState(store, viewer, 'host', event.host.id),
    series: event.seriesId ? followState(store, viewer, 'series', event.seriesId) : null,
  } };
}
export function notifyDemoCommunity(store: DemoCommunityStore, event: Pick<MeetupSummary, 'id' | 'title' | 'host' | 'seriesId'>,
  kind: MeetupNotification['kind'], key: string, recipients: Iterable<string>, now = Date.now()) {
  for (const recipient of new Set(recipients)) {
    const delivery = `${recipient}:${event.id}:${key}`;
    if (recipient === event.host.id || store.delivered.has(delivery)) continue;
    store.delivered.add(delivery);
    const item = { id: Crypto.randomUUID(), meetupId: event.id, meetupTitle: event.title, kind, createdAt: new Date(now).toISOString() };
    store.notifications.set(recipient, [item, ...(store.notifications.get(recipient) ?? [])]);
  }
}
export function demoEventFollowers(store: DemoCommunityStore, event: Pick<MeetupSummary, 'id' | 'host' | 'seriesId'>, includeHost = true) {
  return [...store.follows.values()].filter(row => row.notifications && (row.type === 'event' && row.target === event.id
    || includeHost && row.type === 'host' && row.target === event.host.id || row.type === 'series' && row.target === event.seriesId)).map(row => row.viewer);
}
/** Shared by discovery, direct joining, and offers so an offered place cannot be stolen by a legacy join. */
export function refreshDemoQueue(store: DemoCommunityStore, event: Pick<MeetupSummary, 'id' | 'title' | 'host' | 'seriesId' | 'capacity' | 'participantCount' | 'startsAt' | 'status'>,
  now = Date.now(), eligible: (profileId: string) => boolean = () => true, sponsored: (profileId: string) => boolean = () => false) {
  let queue = (store.queues.get(event.id) ?? []).filter(row => {
    if (row.expiresAt !== null) row.expiresAt = Math.min(row.expiresAt, Date.parse(event.startsAt));
    const keep = (row.expiresAt === null || row.expiresAt > now) && eligible(row.profileId);
    if (!keep) { const app = store.applications.get(event.id)?.get(row.profileId); if (app?.status === 'offered') app.status = 'approved'; }
    return keep;
  });
  if (event.status !== 'published' || Date.parse(event.startsAt) <= now) queue = [];
  let free = event.capacity === null ? queue.length : Math.max(0, event.capacity - event.participantCount - queue.filter(row => row.status === 'offered').length);
  for (const row of queue.sort((a, b) => Number(sponsored(b.profileId)) - Number(sponsored(a.profileId)) || a.createdAt - b.createdAt || a.profileId.localeCompare(b.profileId))) {
    if (free <= 0) break;
    if (row.status === 'waiting' && row.approved) {
      row.status = 'offered'; row.expiresAt = Math.min(now + 86400000, Date.parse(event.startsAt)); free--;
      const app = store.applications.get(event.id)?.get(row.profileId); if (app) app.status = 'offered';
      notifyDemoCommunity(store, event, 'community_waitlist_offer', `offer:${row.profileId}:${row.expiresAt}`, [row.profileId], now);
    }
  }
  store.queues.set(event.id, queue);
  return queue;
}
function totalReputation(rows: CommunityReputation[]): CommunityReputation {
  const sum = rows.reduce((total, row) => ({ positive: total.positive + row.positive, negative: total.negative + row.negative,
    total: total.total + row.total, legacyCount: total.legacyCount + row.legacyCount,
    legacySum: total.legacySum + (row.legacyAverage ?? 0) * row.legacyCount }), { positive: 0, negative: 0, total: 0, legacyCount: 0, legacySum: 0 });
  return { positive: sum.positive, negative: sum.negative, total: sum.total, legacyCount: sum.legacyCount, legacyAverage: sum.legacyCount ? sum.legacySum / sum.legacyCount : null };
}
export class DemoCommunityApi implements CommunityApi {
  private readonly store: DemoCommunityStore;
  private readonly bridge: DemoCommunityBridge | undefined;
  constructor(private readonly api: RummalApi, store?: DemoCommunityStore, private readonly now = () => Date.now()) {
    this.store = store ?? (api as DemoSource).demoCommunityStore ?? demoCommunityStore;
    this.bridge = (api as DemoSource).communityDemo;
  }
  private async viewer() { return (await this.api.getOwnProfile()).id; }
  private async event(id: string) { const event = await this.api.getMeetup(id); this.store.known.set(id, event); return event; }
  private async owner(id: string) { const event = await this.event(id); if (event.host.id !== await this.viewer()) throw new Error('host_required'); return event; }
  private async all() {
    if (this.bridge) return this.bridge.all();
    const current = [...await this.api.discoverMeetups(defaultMeetupFilters), ...await this.api.listMyMeetups()];
    const ids = new Set([...current.map(event => event.id), ...this.store.known.keys()]);
    const refreshed = await Promise.allSettled([...ids].map(id => this.event(id)));
    return refreshed.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  }
  private async reputation(id: string) {
    const rows = [...(this.store.recommendations.get(id)?.values() ?? [])];
    const legacy = await this.api.listMeetupReviews(id);
    return { positive: rows.filter(row => row.recommended).length, negative: rows.filter(row => !row.recommended).length,
      total: rows.length, legacyCount: legacy.length, legacyAverage: legacy.length ? legacy.reduce((sum, row) => sum + row.rating, 0) / legacy.length : null };
  }
  private refreshQueue(event: MeetupDetail) { return refreshDemoQueue(this.store, event, this.now(), profileId => this.bridge?.eligible(event.id, profileId) ?? true, profileId => this.bridge?.sponsored(event.id, profileId) ?? false); }
  async getState(id: string): Promise<CommunityState> {
    const event = await this.event(id); const viewer = await this.viewer();
    const own = this.store.applications.get(id)?.get(viewer) ?? null;
    const queue = this.refreshQueue(event); const entry = queue.find(row => row.profileId === viewer);
    const candidate = event.status === 'published' && Date.parse(event.startsAt) > this.now()
      && ['none', 'left', 'withdrawn', 'pending'].includes(event.viewerState.participationStatus)
      && (this.bridge?.eligible(id, viewer) ?? !event.requiresDiagnosisVerification);
    const mode = event.eventProfile?.joinMode ?? (event.accessMode === 'private' ? 'request' : 'public');
    const invited = mode !== 'invite' || this.bridge?.eligible(id, viewer) === true || event.capabilities.canJoin;
    return {
      meetupId: id, cover: this.store.covers.get(id) ?? null, follows: decorateDemoCommunity(event, viewer, this.store).follows!,
      canApply: candidate && mode === 'request' && !entry && (!own || ['declined', 'pending'].includes(own.status)),
      canJoinWaitlist: candidate && invited && event.isFull && !entry && (mode !== 'request' || !!own && ['approved', 'waitlisted'].includes(own.status)),
      applicationQuestions: this.store.questions.get(id) ?? [], ownApplication: own ? structuredClone(own) : null,
      waitlist: entry ? { status: entry.status, position: entry.status === 'waiting' ? queue.filter(row => row.status === 'waiting').indexOf(entry) + 1 : null, offerExpiresAt: entry.expiresAt === null ? null : new Date(entry.expiresAt).toISOString() } : null,
    };
  }
  async setFollow(type: CommunityFollowTarget, id: string, following: boolean, notifications = true) {
    const viewer = await this.viewer(); const key = [viewer, type, id].join(':');
    if (!following) { this.store.follows.delete(key); return; }
    if (type === 'event') { const event = await this.event(id); if (event.status !== 'published') throw new Error('event_unavailable'); }
    else if (type === 'series' && !(await this.all()).some(event => event.seriesId === id && event.status === 'published')) throw new Error('series_unavailable');
    else if (type === 'host') { if (id === viewer) throw new Error('cannot_follow_self'); await this.getHostSummary(id); }
    this.store.follows.set(key, { viewer, type, target: id, notifications });
  }
  async listFollowing() {
    const viewer = await this.viewer();
    return (await this.all()).filter(event => event.status === 'published' && Date.parse(event.effectiveEnd) > this.now()
      && [followState(this.store, viewer, 'event', event.id), followState(this.store, viewer, 'host', event.host.id),
        ...(event.seriesId ? [followState(this.store, viewer, 'series', event.seriesId)] : [])].some(row => row.following))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(event => decorateDemoCommunity(event, viewer, this.store));
  }
  async setCover(id: string, mediaId: string | null) {
    await this.owner(id); if (!mediaId) { this.store.covers.delete(id); return; }
    const media = (await this.api.listMeetupMedia(id)).find(row => row.id === mediaId);
    if (!media) throw new Error('media_unavailable');
    this.store.covers.set(id, { id: media.id, kind: media.kind, url: media.url });
  }
  async setQuestions(id: string, questions: string[]) { await this.owner(id); if (this.store.applications.get(id)?.size) throw new Error('application_questions_locked'); this.store.questions.set(id, communityQuestionsSchema.parse(questions)); }
  async apply(id: string, input: CommunityApplicationInput) {
    const parsed = communityApplicationInputSchema.parse(input); const state = await this.getState(id);
    if (!state.canApply || parsed.answers.length !== state.applicationQuestions.length) throw new Error('application_unavailable');
    const profile = await this.api.getOwnProfile();
    if (state.ownApplication?.status !== 'pending') await this.api.requestMeetupAccess(id);
    this.store.applicationRules.set(id + ':' + profile.id, (await this.event(id)).eventProfile?.rules ?? '');
    const applications = this.store.applications.get(id) ?? new Map<string, CommunityApplication>();
    applications.set(profile.id, { profileId: profile.id, displayName: profile.displayName, ...parsed, status: 'pending', createdAt: new Date(this.now()).toISOString() });
    this.store.applications.set(id, applications);
  }
  async listApplications(id: string) {
    await this.owner(id); const saved = this.store.applications.get(id) ?? new Map<string, CommunityApplication>();
    const legacy = await this.api.listMeetupRequests(id);
    return structuredClone([...saved.values(), ...legacy.filter(row => !saved.has(row.profile.id)).map(row => ({
      profileId: row.profile.id, displayName: row.profile.displayName, introduction: '', answers: [], rulesAccepted: false,
      status: row.status === 'pending' ? 'pending' as const : row.status === 'approved' ? 'approved' as const : 'declined' as const, createdAt: row.requestedAt,
    }))]);
  }
  async decideApplication(id: string, profileId: string, approve: boolean) {
    const event = await this.owner(id); const application = this.store.applications.get(id)?.get(profileId);
    if (approve && application && this.store.applicationRules.get(id + ':' + profileId) !== (event.eventProfile?.rules ?? '')) throw new Error('application_rules_changed');
    if (application && application.status !== 'pending') throw new Error('application_not_pending');
    if (approve && this.bridge && !this.bridge.eligible(id, profileId)) throw new Error('applicant_ineligible');
    if (approve && event.isFull) {
      const queue = this.store.queues.get(id) ?? [];
      if (!queue.some(row => row.profileId === profileId)) queue.push({ profileId, status: 'waiting', approved: true, createdAt: Date.parse(application?.createdAt ?? new Date(this.now()).toISOString()), expiresAt: null });
      this.store.queues.set(id, queue); if (application) application.status = 'waitlisted';
    } else {
      await this.api.respondToMeetupRequest(id, profileId, approve);
      if (application) application.status = approve ? 'approved' : 'declined';
    }
    notifyDemoCommunity(this.store, event, approve ? 'request_approved' : 'request_declined', `decision:${profileId}:${this.now()}`, [profileId], this.now());
  }
  async waitlistAction(id: string, action: CommunityWaitlistAction) {
    const event = await this.event(id); const viewer = await this.viewer(); const queue = this.refreshQueue(event); const entry = queue.find(row => row.profileId === viewer);
    if (action === 'leave' || action === 'decline') {
      this.store.queues.set(id, queue.filter(row => row !== entry)); this.refreshQueue(event);
      const app = this.store.applications.get(id)?.get(viewer); if (app) app.status = 'declined';
      if (event.viewerState.participationStatus === 'pending') await this.api.cancelMeetupRequest(id);
      return;
    }
    if (action === 'join') {
      if (!(await this.getState(id)).canJoinWaitlist) throw new Error('waitlist_unavailable');
      if (!entry) queue.push({ profileId: viewer, status: 'waiting', createdAt: this.now(), expiresAt: null, approved: true });
      this.store.queues.set(id, queue); return;
    }
    if (!entry || entry.status !== 'offered' || !entry.expiresAt || entry.expiresAt <= this.now()) throw new Error('offer_expired');
    if (this.bridge) await this.bridge.acceptOffer(id, entry.approved); else await this.api.joinMeetup(id);
    this.store.queues.set(id, queue.filter(row => row !== entry));
    const app = this.store.applications.get(id)?.get(viewer); if (app) app.status = 'joined';
  }
  async listAnnouncements(id: string) {
    const event = await this.event(id); const participant = ['host', 'joined', 'approved'].includes(event.viewerState.participationStatus);
    return structuredClone((this.store.announcements.get(id) ?? []).filter(row => row.audience === 'followers' || participant));
  }
  async publishAnnouncement(id: string, audience: CommunityAnnouncementAudience, body: string) {
    const event = await this.owner(id); if (event.status !== 'published') throw new Error('event_unavailable');
    const announcement = { id: Crypto.randomUUID(), meetupId: id, audience, body: communityAnnouncementBodySchema.parse(body), createdAt: new Date(this.now()).toISOString() };
    this.store.announcements.set(id, [announcement, ...(this.store.announcements.get(id) ?? [])]);
    notifyDemoCommunity(this.store, event, 'community_announcement', `announcement:${announcement.id}`, [...(this.bridge?.participants(id) ?? []), ...(audience === 'followers' ? demoEventFollowers(this.store, event, false) : [])], this.now());
  }
  async listMyAttendance() {
    const viewer = await this.viewer();
    const ids = new Set([...this.store.receipts.keys(), ...this.store.appeals.keys()]);
    const items = await Promise.all([...ids].filter(id => this.store.receipts.get(id)?.has(viewer) || this.store.appeals.get(id)?.has(viewer)).map(async id => {
      const event = this.bridge ? await this.bridge.feedbackEvent(id) : await this.event(id);
      return { meetupId: id, title: event.title, effectiveEnd: event.effectiveEnd, canReview: (await this.getFeedback(id)).canReview };
    }));
    return items.sort((a,b) => Date.parse(b.effectiveEnd) - Date.parse(a.effectiveEnd));
  }
  async getFeedback(id: string): Promise<CommunityFeedback> {
    const event = this.bridge ? await this.bridge.feedbackEvent(id) : await this.event(id); const viewer = await this.viewer(); const own = this.store.recommendations.get(id)?.get(viewer);
    const visible = await this.api.getMeetup(id).then(() => true).catch(() => false);
    const legacy = visible ? await this.api.listMeetupReviews(id) : []; const summary = visible ? await this.reputation(id) : emptyReputation();
    const series = visible && event.seriesId ? await Promise.all((await this.all()).filter(row => row.seriesId === event.seriesId && Date.parse(row.effectiveEnd) < this.now()).map(row => this.reputation(row.id))) : [];
    return {
      summary, reviews: visible ? [...[...(this.store.recommendations.get(id)?.values() ?? [])].filter(row => row.body).map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, legacyRating: null })),
        ...legacy.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, legacyRating: row.rating }))] : [],
      canReview: ['published', 'cancelled'].includes(event.status) && event.host.id !== viewer && Date.parse(event.effectiveEnd) < this.now()
        && (this.store.receipts.get(id)?.has(viewer) === true || this.store.appeals.get(id)?.get(viewer) === 'approved'),
      ownReview: own ? { recommended: own.recommended, body: own.body } : null,
      attendanceReviewStatus: this.store.appeals.get(id)?.get(viewer) ?? null, seriesSummary: series.length ? totalReputation(series) : null,
    };
  }
  async recommend(id: string, recommended: boolean, body = '') {
    const input = communityRecommendationInputSchema.parse({ recommended, body });
    if (!(await this.getFeedback(id)).canReview) throw new Error('recorded_attendance_required');
    const viewer = await this.viewer(); const rows = this.store.recommendations.get(id) ?? new Map<string, Recommendation>();
    rows.set(viewer, { ...input, viewer, id: rows.get(viewer)?.id ?? Crypto.randomUUID(), createdAt: rows.get(viewer)?.createdAt ?? new Date(this.now()).toISOString() }); this.store.recommendations.set(id, rows);
  }
  async deleteRecommendation(id: string) { this.store.recommendations.get(id)?.delete(await this.viewer()); }
  async getHostSummary(id: string): Promise<CommunityHostSummary> {
    const events = (await this.all()).filter(event => event.host.id === id && event.status === 'published');
    const viewer = await this.viewer(); const follow = followState(this.store, viewer, 'host', id);
    const own = id === viewer ? await this.api.getOwnProfile() : null;
    const profile = this.bridge ? await this.bridge.host(id) : own ? { displayName: own.displayName, profileVisible: !own.isHidden } : await this.api.getProfile(id).then(value => ({ displayName: value.displayName, profileVisible: true })).catch(() => null);
    if (!profile && !events.length) throw new Error('host_unavailable');
    const past = events.filter(event => Date.parse(event.effectiveEnd) < this.now()).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const feedback = await Promise.all(past.map(event => this.reputation(event.id)));
    return { hostId: id, displayName: profile?.displayName ?? events[0]!.host.displayName, profileVisible: profile?.profileVisible ?? false,
      followerCount: follow.count, following: follow.following, notifications: follow.notifications, reputation: totalReputation(feedback),
      upcomingGatherings: events.filter(event => Date.parse(event.effectiveEnd) >= this.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(event => decorateDemoCommunity(event, viewer, this.store)),
      pastGatherings: past.map((event, index) => ({ id: event.id, title: event.title, startsAt: event.startsAt, cover: this.store.covers.get(event.id) ?? null, feedback: feedback[index]! })) };
  }
  async createAttendanceCode(id: string) {
    const event = await this.owner(id); const now = this.now();
    if (event.status !== 'published' || now < Date.parse(event.startsAt) || now >= Date.parse(event.effectiveEnd)) throw new Error('checkin_unavailable');
    const existing = (this.store.codes.get(id) ?? []).filter(row => row.expiresAt > now);
    const recent = existing.at(-1); if (recent && recent.expiresAt - now > 30000) return { code: recent.code, expiresAt: new Date(recent.expiresAt).toISOString() };
    const code = Crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(); const expiresAt = Math.min(now + 60000, Date.parse(event.effectiveEnd));
    this.store.codes.set(id, [...existing, { code, expiresAt }]); return { code, expiresAt: new Date(expiresAt).toISOString() };
  }
  async recordAttendance(id: string, code: string) {
    const event = await this.event(id); const viewer = await this.viewer(); const now = this.now();
    if (this.store.receipts.get(id)?.has(viewer)) return;
    if (!['joined', 'approved'].includes(event.viewerState.participationStatus) || event.status !== 'published'
      || now < Date.parse(event.startsAt) || now >= Date.parse(event.effectiveEnd)
      || !(this.store.codes.get(id) ?? []).some(row => row.code === code.trim().toUpperCase() && row.expiresAt > now)) throw new Error('checkin_unavailable');
    const receipts = this.store.receipts.get(id) ?? new Set<string>(); receipts.add(viewer); this.store.receipts.set(id, receipts);
  }
  async requestAttendanceReview(id: string, reason: string) {
    communityAttendanceReviewReasonSchema.parse(reason); const event = await this.event(id); const viewer = await this.viewer();
    if (event.host.id === viewer || Date.parse(event.effectiveEnd) >= this.now() || !['joined', 'approved', 'removed', 'left'].includes(event.viewerState.participationStatus)) throw new Error('attendance_review_unavailable');
    const appeals = this.store.appeals.get(id) ?? new Map<string, 'pending' | 'approved' | 'rejected'>();
    if (appeals.get(viewer) !== 'approved') appeals.set(viewer, 'pending'); this.store.appeals.set(id, appeals);
  }
}
