import { z } from 'zod';
import {
  publicCommunitySchema,
  communityPostSchema,
  communityCommentSchema,
  socialFeedPageSchema,
  communityCommentsPageSchema,
  publishCommunityPostSchema,
  publishCommunityCommentSchema,
  type CommunityPost,
  type PublicCommunity,
  type CommunityComment,
  type PublishCommunityPost,
  type PublishCommunityComment,
} from '@rummal/shared';
import { supabase } from './supabase';
import { queueMediaUpload } from './mediaUpload';
import type { SocialFeedApi } from './socialFeedTypes';

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
const defaultRpc: Rpc = async (name, args) => {
  if (!supabase) throw new Error('social_feed_unavailable');
  const original = await supabase.auth.getSession();
  if (original.error || !original.data.session) throw new Error('social_feed_session_changed');
  const client = supabase as unknown as {
    rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  };
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session?.user.id !== original.data.session.user.id)
    throw new Error('social_feed_session_changed');
  return result.data;
};
/** URLs have a short lifetime; every refresh checks storage authorization again. */
export async function signSocialFeedMedia<
  T extends PublicCommunity | CommunityPost | CommunityComment,
>(items: T[]): Promise<T[]> {
  if (!supabase) return items;
  const session = await supabase.auth.getSession();
  if (!session.data.session || session.error) throw new Error('social_feed_session_changed');
  const identity = session.data.session.user.id;
  const sign = async (bucket: string, path: string | null) => {
    if (!path) return undefined;
    try {
      const result = await supabase!.storage.from(bucket).createSignedUrl(path, 60);
      return result.error ? undefined : result.data.signedUrl;
    } catch {
      return undefined;
    }
  };
  const result = await Promise.all(
    items.map(async (item) => {
      if ('author' in item) {
        const photoUrl = await sign('profile-photos', item.author.photoPath);
        const photoPosterUrl = item.author.photoPath?.endsWith('.gif')
          ? await sign('profile-photos', item.author.photoPath.replace(/\.gif$/, '-thumb.jpg'))
          : undefined;
        const author = { ...item.author, photoUrl, photoPosterUrl };
        if ('imageStatus' in item)
          return {
            ...item,
            author,
            imageUrl:
              item.imageStatus === 'approved'
                ? await sign('social-feed-media', item.imagePath)
                : undefined,
          };
        return { ...item, author };
      }
      return { ...item, coverUrl: await sign('social-feed-media', item.coverPath) };
    }),
  );
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session?.user.id !== identity)
    throw new Error('social_feed_session_changed');
  return result as T[];
}
export class LiveSocialFeedApi implements SocialFeedApi {
  constructor(
    private rpc: Rpc = defaultRpc,
    private sign: typeof signSocialFeedMedia = signSocialFeedMedia,
  ) {}
  async directory() {
    return this.sign(z.array(publicCommunitySchema).parse(await this.rpc('social_feed_directory')));
  }
  async community(id: string) {
    return (
      await this.sign([
        publicCommunitySchema.parse(await this.rpc('social_feed_community', { p_id: id })),
      ])
    )[0]!;
  }
  async setMembership(id: string, joined: boolean) {
    return (
      await this.sign([
        publicCommunitySchema.parse(
          await this.rpc('social_feed_membership', { p_id: id, p_joined: joined }),
        ),
      ])
    )[0]!;
  }
  async feed(communityId: string | null = null, cursor: string | null = null) {
    const result = socialFeedPageSchema.parse(
      await this.rpc('social_feed_posts', { p_community: communityId, p_cursor: cursor }),
    );
    return { ...result, items: await this.sign(result.items) };
  }
  async post(id: string) {
    return (
      await this.sign([communityPostSchema.parse(await this.rpc('social_feed_post', { p_id: id }))])
    )[0]!;
  }
  async publish(input: PublishCommunityPost) {
    const parsed = publishCommunityPostSchema.parse(input);
    return (
      await this.sign([
        communityPostSchema.parse(
          await this.rpc('social_feed_publish', {
            p_request: parsed.requestId,
            p_community: parsed.communityId,
            p_body: parsed.body,
          }),
        ),
      ])
    )[0]!;
  }
  async setLiked(id: string, liked: boolean) {
    return (
      await this.sign([
        communityPostSchema.parse(await this.rpc('social_feed_like', { p_id: id, p_liked: liked })),
      ])
    )[0]!;
  }
  async deletePost(id: string) {
    await this.rpc('social_feed_delete', { p_kind: 'post', p_id: id });
  }
  async comments(id: string, cursor: string | null = null) {
    const result = communityCommentsPageSchema.parse(
      await this.rpc('social_feed_comments', { p_post: id, p_cursor: cursor }),
    );
    return { ...result, items: await this.sign(result.items) };
  }
  async comment(id: string, input: PublishCommunityComment) {
    const parsed = publishCommunityCommentSchema.parse(input);
    return (
      await this.sign([
        communityCommentSchema.parse(
          await this.rpc('social_feed_comment', {
            p_post: id,
            p_request: parsed.requestId,
            p_body: parsed.body,
          }),
        ),
      ])
    )[0]!;
  }
  async deleteComment(id: string) {
    await this.rpc('social_feed_delete', { p_kind: 'comment', p_id: id });
  }
  async report(
    kind: 'post' | 'comment',
    id: string,
    category: string,
    details: string,
    requestId: string,
  ) {
    await this.rpc('social_feed_report', {
      p_kind: kind,
      p_id: id,
      p_category: category,
      p_details: z.string().trim().max(2000).parse(details),
      p_request: z.uuid().parse(requestId),
    });
  }
  async uploadImage(id: string, uri: string, mimeType = 'image/jpeg') {
    await queueMediaUpload('social_feed_post', id, uri, 'image', mimeType);
  }
}
