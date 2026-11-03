import * as Crypto from 'expo-crypto';
import {
  defaultMemoryWallSettings, memoryWallSettingsSchema, memoryCaptionSchema, memoryCommentBodySchema,
  type MemoryWallSettings, type MemoryPost, type MemoryComment, type MeetupDetail,
} from '@rummal/shared';
import type { RummalApi } from './types';
import type { DemoCommunityStore, DemoCommunityBridge } from './communityDemo';
import { validateMemoryMedia, type MemoryWallApi } from './memoryWallTypes';

type Source = RummalApi & { demoCommunityStore?: DemoCommunityStore; communityDemo?: DemoCommunityBridge };
export class DemoMemoryWallStore {
  settings = new Map<string, MemoryWallSettings>();
  posts = new Map<string, MemoryPost>();
  comments = new Map<string, MemoryComment>();
  likes = new Map<string, Set<string>>();
}
function publicEvent(event: MeetupDetail) {
  return event.status === 'published' && event.accessMode === 'open'
    && (!event.eventProfile || event.eventProfile.joinMode === 'public')
    && !event.isExplicit && !event.diagnosisRestricted && !event.requiresDiagnosisVerification;
}
function pagination(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('invalid_pagination');
}
/** Demo ownership and attendance are checked through the same demo session as Hittingar. */
export class DemoMemoryWallApi implements MemoryWallApi {
  constructor(private readonly source: Source, readonly store = new DemoMemoryWallStore(), private readonly now = () => Date.now()) {}
  private async context(id: string) {
    const viewer = await this.source.getOwnProfile();
    const event = await (this.source.communityDemo?.feedbackEvent(id) ?? this.source.getMeetup(id));
    const canManage = event.host.id === viewer.id;
    const settings = this.store.settings.get(id) ?? { ...defaultMemoryWallSettings };
    if (!canManage && (!publicEvent(event) || !settings.enabled)) throw new Error('memory_wall_unavailable');
    const attendance = this.source.demoCommunityStore;
    const attended = attendance?.receipts.get(id)?.has(viewer.id)
      || attendance?.appeals.get(id)?.get(viewer.id) === 'approved';
    const eligible = this.source.communityDemo?.eligible(id, viewer.id) ?? true;
    const visible = publicEvent(event) && settings.enabled;
    return { viewer, event, settings, canManage, canInteract: visible && eligible,
      canPost: visible && eligible && Date.parse(event.startsAt) <= this.now()
        && (canManage || Boolean(attended)) && event.viewerState.participationStatus !== 'removed' };
  }
  private async post(postId: string) {
    const post = this.store.posts.get(postId);
    if (!post) throw new Error('memory_unavailable');
    return { post, ...await this.context(post.meetupId) };
  }
  async getWall(id: string, limit = 30, offset = 0) {
    pagination(limit, offset);
    const context = await this.context(id);
    const visible = context.settings.enabled && publicEvent(context.event);
    const posts = [...this.store.posts.values()].filter(post => visible && post.meetupId === id)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { meetupId: id, meetupTitle: context.event.title, settings: { ...context.settings },
      canPost: context.canPost, canManage: context.canManage, canInteract: context.canInteract,
      posts: posts.slice(offset, offset + limit).map(post => ({ ...post,
        likeCount: this.store.likes.get(post.id)?.size ?? 0,
        likedByViewer: this.store.likes.get(post.id)?.has(context.viewer.id) ?? false,
        commentCount: [...this.store.comments.values()].filter(comment => comment.postId === post.id).length,
        canDelete: context.canManage || post.authorId === context.viewer.id,
      })), hasMore: posts.length > offset + limit };
  }
  async updateSettings(id: string, settings: MemoryWallSettings) {
    const context = await this.context(id);
    if (!context.canManage) throw new Error('host_required');
    const parsed = memoryWallSettingsSchema.parse(settings);
    if (parsed.enabled && !publicEvent(context.event)) throw new Error('public_event_required');
    this.store.settings.set(id, parsed);
  }
  async upload(id: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string) {
    validateMemoryMedia(kind, mimeType);
    const body = memoryCaptionSchema.parse(caption);
    const { canPost, viewer } = await this.context(id);
    if (!canPost) throw new Error('recorded_attendance_required');
    const postId = Crypto.randomUUID();
    this.store.posts.set(postId, { id: postId, meetupId: id, authorId: viewer.id, authorName: viewer.displayName,
      kind, url: uri, caption: body, createdAt: new Date(this.now()).toISOString(),
      likeCount: 0, commentCount: 0, likedByViewer: false, pinned: false, canDelete: true });
  }
  async setLike(postId: string, liked: boolean) {
    const context = await this.post(postId);
    if (!context.canInteract) throw new Error('memory_wall_unavailable');
    const likes = this.store.likes.get(postId) ?? new Set<string>();
    if (liked) likes.add(context.viewer.id); else likes.delete(context.viewer.id);
    this.store.likes.set(postId, likes);
  }
  async listComments(postId: string, limit = 50, offset = 0) {
    pagination(limit, offset);
    const context = await this.post(postId);
    return [...this.store.comments.values()].filter(comment => comment.postId === postId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(offset, offset + limit).map(comment => ({ ...comment,
        canDelete: context.canManage || comment.authorId === context.viewer.id }));
  }
  async addComment(postId: string, body: string) {
    const parsed = memoryCommentBodySchema.parse(body);
    const context = await this.post(postId);
    if (!context.canInteract) throw new Error('memory_wall_unavailable');
    const id = Crypto.randomUUID();
    this.store.comments.set(id, { id, postId, authorId: context.viewer.id, authorName: context.viewer.displayName,
      body: parsed, createdAt: new Date(this.now()).toISOString(), canDelete: true });
  }
  async deleteComment(commentId: string) {
    const comment = this.store.comments.get(commentId);
    if (!comment) throw new Error('comment_unavailable');
    const context = await this.post(comment.postId);
    if (!context.canManage && comment.authorId !== context.viewer.id) throw new Error('comment_owner_required');
    this.store.comments.delete(commentId);
  }
  async deletePost(postId: string) {
    const context = await this.post(postId);
    if (!context.canManage && context.post.authorId !== context.viewer.id) throw new Error('memory_owner_required');
    this.store.posts.delete(postId); this.store.likes.delete(postId);
    for (const comment of this.store.comments.values()) if (comment.postId === postId) this.store.comments.delete(comment.id);
  }
  async pinPost(postId: string, pinned: boolean) {
    const context = await this.post(postId);
    if (!context.canManage) throw new Error('host_required');
    context.post.pinned = pinned;
  }
}
