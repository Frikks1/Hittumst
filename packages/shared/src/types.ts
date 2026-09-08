export type Locale = 'is' | 'en';

export type IcelandRegion =
  | 'capital'
  | 'south'
  | 'west'
  | 'westfjords'
  | 'northwest'
  | 'northeast'
  | 'east'
  | 'southwest';

export type Identity =
  | 'man'
  | 'woman'
  | 'nonbinary'
  | 'trans_man'
  | 'trans_woman'
  | 'genderqueer'
  | 'self_described';

export type Intent =
  | 'chat'
  | 'friends'
  | 'dates'
  | 'relationship'
  | 'networking'
  | 'right_now';

export type DistanceBand =
  | '<1 km'
  | '1–3 km'
  | '3–10 km'
  | '10–25 km'
  | '25–50 km'
  | '50+ km';

export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'impersonation'
  | 'spam'
  | 'underage'
  | 'non_consensual_intimate_image'
  | 'threat'
  | 'other';

export interface PublicPhoto {
  id: string;
  path: string;
  position: number;
  blurHash?: string | null;
}

export interface DiscoveryProfile {
  id: string;
  displayName: string;
  age: number;
  pronouns?: string | null;
  identity: Identity;
  intents: Intent[];
  bio?: string | null;
  region: IcelandRegion;
  distanceBand: DistanceBand;
  isOnline: boolean;
  photos: PublicPhoto[];
}

export interface DiscoveryFilters {
  ageMin: number;
  ageMax: number;
  identities: Identity[];
  intents: Intent[];
  onlineOnly: boolean;
}

export interface DiscoveryPage {
  profiles: DiscoveryProfile[];
  nextCursor: string | null;
}

export interface ConversationSummary {
  id: string;
  peer: Pick<DiscoveryProfile, 'id' | 'displayName' | 'photos' | 'isOnline'>;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  imagePath: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface LocationVerification {
  allowed: boolean;
  reason: 'verified' | 'outside_iceland' | 'stale' | 'low_accuracy' | 'rate_limited';
  verifiedAt: string | null;
  expiresAt: string | null;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  conversationId: string | null;
  messageId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  priority: 'standard' | 'urgent' | 'critical';
  createdAt: string;
}
