import type {
  PublicCommunity,
  CommunityPost,
  CommunityComment,
  SocialFeedPage,
  CommunityCommentsPage,
  PublishCommunityPost,
  PublishCommunityComment,
} from '@rummal/shared';
export interface SocialFeedApi {
  directory(): Promise<PublicCommunity[]>;
  community(id: string): Promise<PublicCommunity>;
  setMembership(id: string, joined: boolean): Promise<PublicCommunity>;
  feed(communityId?: string | null, cursor?: string | null): Promise<SocialFeedPage>;
  post(id: string): Promise<CommunityPost>;
  publish(input: PublishCommunityPost): Promise<CommunityPost>;
  setLiked(id: string, liked: boolean): Promise<CommunityPost>;
  deletePost(id: string): Promise<void>;
  comments(id: string, cursor?: string | null): Promise<CommunityCommentsPage>;
  comment(id: string, input: PublishCommunityComment): Promise<CommunityComment>;
  deleteComment(id: string): Promise<void>;
  report(
    kind: 'post' | 'comment',
    id: string,
    category: string,
    details: string,
    requestId: string,
  ): Promise<void>;
  uploadImage(id: string, uri: string, mimeType?: string): Promise<void>;
}
