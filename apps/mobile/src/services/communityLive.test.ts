import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrls: mocks.sign }) } } }));
import { LiveCommunityApi } from './communityLive';
import { signCommunityCovers } from './communityMedia';

const reputation = { positive: 2, negative: 1, total: 3, legacyCount: 1, legacyAverage: 4 };
const follow = { count: 2, following: false, notifications: true };
const state = { meetupId: 'event', cover: null, follows: { event: follow, host: follow, series: null }, canApply: true, canJoinWaitlist: false, applicationQuestions: [], ownApplication: null, waitlist: null };
beforeEach(() => mocks.sign.mockReset());
describe('community service boundaries', () => {
  it('follows without calling participation or finance and retains notification preferences', async () => {
    const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => null); const api = new LiveCommunityApi(rpc);
    await api.setFollow('series', 'series-id', true, false);
    expect(rpc.mock.calls).toEqual([['community_set_follow', { p_target_type: 'series', p_target_id: 'series-id', p_following: true, p_notifications: false }]]);
  });
  it('strips identity and individual verdict fields from public feedback', async () => {
    const rpc = vi.fn(async () => ({ summary: reputation, reviews: [{ id: 'r', body: 'Welcoming event', createdAt: '2026-09-25', authorId: 'private-person', authorName: 'Secret', recommended: false, legacyRating: null }], canReview: true, ownReview: { recommended: true, body: '' }, attendanceReviewStatus: null, seriesSummary: null }));
    const result = await new LiveCommunityApi(rpc).getFeedback('event');
    expect(result.reviews[0]).toEqual({ id: 'r', body: 'Welcoming event', createdAt: '2026-09-25', legacyRating: null });
    expect(JSON.stringify(result)).not.toContain('private-person');
    expect(result.ownReview?.recommended).toBe(true);
  });
  it('allows a verdict without forcing a public written review', async () => {
    const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => null); await new LiveCommunityApi(rpc).recommend('event', false);
    expect(rpc).toHaveBeenCalledWith('save_meetup_recommendation', { p_meetup_id: 'event', p_recommended: false, p_body: '' });
  });
  it('requires rule acceptance and rejects extra application fields before sending', async () => {
    const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => null); const api = new LiveCommunityApi(rpc);
    await expect(api.apply('event', { introduction: 'Hello', answers: [], rulesAccepted: false } as never)).rejects.toThrow();
    await expect(api.apply('event', { introduction: 'Hello', answers: [], rulesAccepted: true, approved: true } as never)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sends private application answers and an explicit waitlist acceptance', async () => {
    const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => null); const api = new LiveCommunityApi(rpc);
    await api.apply('event', { introduction: '  Hello  ', answers: ['Quiet group'], rulesAccepted: true });
    await api.waitlistAction('event', 'accept');
    expect(rpc).toHaveBeenNthCalledWith(1, 'community_apply', { p_meetup_id: 'event', p_introduction: 'Hello', p_answers: ['Quiet group'], p_rules_accepted: true });
    expect(rpc).toHaveBeenNthCalledWith(2, 'community_waitlist_action', { p_meetup_id: 'event', p_action: 'accept' });
  });
  it('propagates admission and capacity failures instead of showing success', async () => {
    const api = new LiveCommunityApi(async () => { throw new Error('meetup_full'); });
    await expect(api.waitlistAction('event', 'accept')).rejects.toThrow('meetup_full');
  });
  it('does not call commerce when checking in or requesting a review exception', async () => {
    const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => null); const api = new LiveCommunityApi(rpc);
    await api.recordAttendance('event', ' CODE ');
    await api.requestAttendanceReview('event', 'My camera did not work during the gathering.');
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['record_meetup_attendance', 'request_meetup_attendance_review']);
  });
  it('rejects malformed backend state instead of inventing admission permissions', async () => {
    const api = new LiveCommunityApi(async () => ({ ...state, canApply: undefined }));
    await expect(api.getState('event')).rejects.toThrow();
  });
});
describe('private cover signing', () => {
  it('signs image and video poster together once, omitting unapproved assets', async () => {
    mocks.sign.mockResolvedValue({ data: [{ path: 'event/video.mp4', signedUrl: 'https://storage/video' }, { path: 'event/poster.jpg', signedUrl: 'https://storage/poster' }], error: null });
    const covers = await signCommunityCovers([{ id: 'media', kind: 'video', storagePath: 'event/video.mp4', posterPath: 'event/poster.jpg' }, null]);
    expect(mocks.sign).toHaveBeenCalledWith(['event/video.mp4', 'event/poster.jpg'], 300);
    expect(covers[0]).toMatchObject({ url: 'https://storage/video', posterUrl: 'https://storage/poster' }); expect(covers[1]).toBeNull();
  });
  it('keeps the event usable with a fallback when cover signing fails', async () => {
    mocks.sign.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    const api = new LiveCommunityApi(async () => ({ ...state, cover: { id: 'media', kind: 'photo', storagePath: 'event/photo.jpg' } }));
    expect(await api.getState('event')).toMatchObject({ canApply: true, cover: { id: 'media', url: undefined } });
  });
  it('does not request storage URLs for a pending or missing cover', async () => {
    expect(await signCommunityCovers([null, undefined])).toEqual([null, null]); expect(mocks.sign).not.toHaveBeenCalled();
  });
});
