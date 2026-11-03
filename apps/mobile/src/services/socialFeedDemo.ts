import * as Crypto from 'expo-crypto';
import {
  publishCommunityPostSchema,
  publishCommunityCommentSchema,
  type PublicCommunity,
  type CommunityPost,
  type CommunityComment,
  type PublishCommunityPost,
  type PublishCommunityComment,
} from '@rummal/shared';
import type { RummalApi } from './types';
import type { SocialFeedApi } from './socialFeedTypes';
type Source = Pick<RummalApi, 'getOwnProfile' | 'listBlocked'>;
export class DemoSocialFeedApi implements SocialFeedApi {
  private communities = new Map<string, PublicCommunity>();
  private posts = new Map<string, CommunityPost>();
  private replies = new Map<string, CommunityComment>();
  private memberships = new Map<string, Set<string>>();
  private likes = new Map<string, Set<string>>();
  private requests = new Map<string, { input: string; id: string }>();
  readonly reports: {
    kind: string;
    id: string;
    category: string;
    details: string;
    reporter: string;
    requestId: string;
  }[] = [];
  constructor(
    private source: Source,
    private now = Date.now,
    seed = true,
  ) {
    if (seed) {
      const date = new Date(this.now() - 86400000).toISOString();
      for (const [index, name, description] of [
        [1, 'Trans Ísland', 'Spjall og samvera fyrir trans fólk og bandafólk.'],
        [2, 'Hinsegin foreldrar', 'Vettvangur fyrir hinsegin foreldra og fjölskyldur.'],
        [3, 'Queer bókaklúbbur', 'Bækur, kaffi og góðar samræður.'],
      ] as const) {
        const id = `82000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
        this.communities.set(id, {
          id,
          name,
          description,
          status: 'active',
          memberCount: 0,
          joined: false,
          coverPath: null,
          createdAt: date,
        });
        this.memberships.set(id, new Set());
      }
      const id = '83000000-0000-4000-8000-000000000001';
      this.posts.set(id, {
        id,
        author: { id: 'demo-hrafn', displayName: 'Hrafn', pronouns: 'hann/hans', photoPath: null },
        community: null,
        body: 'Góðan daginn! Er einhver til í rólegan göngutúr og kaffi um helgina?',
        createdAt: new Date(this.now() - 7200000).toISOString(),
        likeCount: 0,
        commentCount: 0,
        liked: false,
        canDelete: false,
        imageStatus: 'none',
        imagePath: null,
      });
    }
  }
  private async context() {
    const [viewer, blocked] = await Promise.all([
      this.source.getOwnProfile(),
      this.source.listBlocked(),
    ]);
    return { viewer, blocked: new Set(blocked.map((item) => item.id)) };
  }
  private visible(post: CommunityPost, blocked: Set<string>) {
    return (
      !blocked.has(post.author.id) &&
      (!post.community || this.communities.get(post.community.id)?.status !== 'hidden')
    );
  }
  private async owned(id: string) {
    const context = await this.context();
    const item = this.posts.get(id);
    if (!item || !this.visible(item, context.blocked)) throw new Error('social_feed_unavailable');
    return { ...context, item };
  }
  private project(item: CommunityPost, viewer: string, blocked: Set<string>) {
    return structuredClone({
      ...item,
      canDelete: item.author.id === viewer,
      liked: this.likes.get(item.id)?.has(viewer) ?? false,
      likeCount: [...(this.likes.get(item.id) ?? [])].filter((id) => !blocked.has(id)).length,
      commentCount: [...this.replies.values()].filter(
        (row) => row.postId === item.id && !blocked.has(row.author.id),
      ).length,
    });
  }
  async directory() {
    const { viewer } = await this.context();
    return [...this.communities.values()]
      .filter((item) => item.status === 'active')
      .map((item) =>
        structuredClone({
          ...item,
          memberCount: this.memberships.get(item.id)?.size ?? 0,
          joined: this.memberships.get(item.id)?.has(viewer.id) ?? false,
        }),
      );
  }
  async community(id: string) {
    const { viewer } = await this.context();
    const item = this.communities.get(id);
    if (!item || item.status === 'hidden') throw new Error('social_feed_unavailable');
    return structuredClone({
      ...item,
      memberCount: this.memberships.get(id)?.size ?? 0,
      joined: this.memberships.get(id)?.has(viewer.id) ?? false,
    });
  }
  async setMembership(id: string, joined: boolean) {
    const { viewer } = await this.context();
    const item = await this.community(id);
    if (joined && item.status !== 'active') throw new Error('community_archived');
    const members = this.memberships.get(id) ?? new Set<string>();
    if (joined) members.add(viewer.id);
    else members.delete(viewer.id);
    this.memberships.set(id, members);
    return this.community(id);
  }
  async feed(communityId: string | null = null, cursor: string | null = null) {
    const { viewer, blocked } = await this.context();
    if (communityId) await this.community(communityId);
    const after = cursor ? (JSON.parse(cursor) as { createdAt: string; id: string }) : null;
    const rows = [...this.posts.values()]
      .filter(
        (item) =>
          this.visible(item, blocked) &&
          (!communityId || item.community?.id === communityId) &&
          (!after ||
            item.createdAt < after.createdAt ||
            (item.createdAt === after.createdAt && item.id < after.id)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const items = rows.slice(0, 20).map((item) => this.project(item, viewer.id, blocked));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 20 && last
          ? JSON.stringify({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
  async post(id: string) {
    const { item, viewer, blocked } = await this.owned(id);
    return this.project(item, viewer.id, blocked);
  }
  async publish(input: PublishCommunityPost) {
    const parsed = publishCommunityPostSchema.parse(input);
    const { viewer } = await this.context();
    let community: CommunityPost['community'] = null;
    if (parsed.communityId) {
      const item = await this.community(parsed.communityId);
      if (!item.joined || item.status !== 'active')
        throw new Error('community_membership_required');
      community = { id: item.id, name: item.name };
    }
    const key = viewer.id + ':' + parsed.requestId;
    const content = JSON.stringify({ communityId: parsed.communityId, body: parsed.body });
    const old = this.requests.get(key);
    if (old) {
      if (old.input !== content) throw new Error('social_feed_request_conflict');
      return this.post(old.id);
    }
    const id = Crypto.randomUUID();
    const photo =
      viewer.photos.find((item) => item.id === viewer.coverPhotoId && item.status === 'approved') ??
      viewer.photos.find((item) => item.status === 'approved');
    this.posts.set(id, {
      id,
      author: {
        id: viewer.id,
        displayName: viewer.displayName,
        pronouns: viewer.pronouns ?? null,
        photoPath: null,
        photoUrl: photo?.url,
      },
      community,
      body: parsed.body,
      createdAt: new Date(this.now()).toISOString(),
      likeCount: 0,
      commentCount: 0,
      liked: false,
      canDelete: true,
      imageStatus: 'none',
      imagePath: null,
    });
    this.requests.set(key, { input: content, id });
    return this.post(id);
  }
  async setLiked(id: string, liked: boolean) {
    const { viewer } = await this.owned(id);
    const users = this.likes.get(id) ?? new Set<string>();
    if (liked) users.add(viewer.id);
    else users.delete(viewer.id);
    this.likes.set(id, users);
    return this.post(id);
  }
  async deletePost(id: string) {
    const { viewer } = await this.context();
    const item = this.posts.get(id);
    if (!item) return;
    if (item.author.id !== viewer.id) throw new Error('social_feed_owner_required');
    this.posts.delete(id);
    for (const [key, reply] of this.replies) if (reply.postId === id) this.replies.delete(key);
    this.likes.delete(id);
  }
  async comments(id: string, cursor: string | null = null) {
    const { viewer, blocked } = await this.owned(id);
    const after = cursor ? (JSON.parse(cursor) as { createdAt: string; id: string }) : null;
    const rows = [...this.replies.values()]
      .filter(
        (item) =>
          item.postId === id &&
          !blocked.has(item.author.id) &&
          (!after ||
            item.createdAt < after.createdAt ||
            (item.createdAt === after.createdAt && item.id < after.id)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const items = rows
      .slice(0, 20)
      .map((item) => structuredClone({ ...item, canDelete: item.author.id === viewer.id }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 20 && last
          ? JSON.stringify({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
  async comment(id: string, input: PublishCommunityComment) {
    const parsed = publishCommunityCommentSchema.parse(input);
    const { viewer } = await this.owned(id);
    const key = viewer.id + ':comment:' + parsed.requestId;
    const content = JSON.stringify({ postId: id, body: parsed.body });
    const old = this.requests.get(key);
    if (old) {
      if (old.input !== content) throw new Error('social_feed_request_conflict');
      const row = this.replies.get(old.id);
      if (!row) throw new Error('social_feed_unavailable');
      return structuredClone(row);
    }
    const reply: CommunityComment = {
      id: Crypto.randomUUID(),
      postId: id,
      author: {
        id: viewer.id,
        displayName: viewer.displayName,
        pronouns: viewer.pronouns ?? null,
        photoPath: null,
        photoUrl: viewer.photos.find((item) => item.status === 'approved')?.url,
      },
      body: parsed.body,
      createdAt: new Date(this.now()).toISOString(),
      canDelete: true,
    };
    this.replies.set(reply.id, reply);
    this.requests.set(key, { input: content, id: reply.id });
    return structuredClone(reply);
  }
  async deleteComment(id: string) {
    const { viewer } = await this.context();
    const item = this.replies.get(id);
    if (!item) return;
    if (item.author.id !== viewer.id) throw new Error('social_feed_owner_required');
    this.replies.delete(id);
  }
  async report(
    kind: 'post' | 'comment',
    id: string,
    category: string,
    details: string,
    requestId: string,
  ) {
    const { viewer, blocked } = await this.context();
    const item = kind === 'post' ? (await this.owned(id)).item : this.replies.get(id);
    if (
      !item ||
      item.author.id === viewer.id ||
      blocked.has(item.author.id) ||
      !category ||
      details.length > 2000
    )
      throw new Error('invalid_report');
    if (kind === 'comment') await this.owned((item as CommunityComment).postId);
    const old = this.reports.find(
      (row) => row.reporter === viewer.id && row.requestId === requestId,
    );
    if (old) {
      if (
        old.kind !== kind ||
        old.id !== id ||
        old.category !== category ||
        old.details !== details
      )
        throw new Error('social_feed_request_conflict');
      return;
    }
    this.reports.push({ kind, id, category, details, reporter: viewer.id, requestId });
  }
  async uploadImage(id: string, uri: string, mimeType = 'image/jpeg') {
    const { viewer, item } = await this.owned(id);
    if (
      item.author.id !== viewer.id ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
    )
      throw new Error('invalid_media');
    item.imageUrl = uri;
    item.imageStatus = 'approved';
  }
}
