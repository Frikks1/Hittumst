export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
export type ReportPriority = "critical" | "urgent" | "standard";
export type PhotoDecision = "approved" | "rejected";

export interface PersonSummary {
  id: string;
  displayName: string;
  initials: string;
  region?: string;
  age?: number;
  identity?: string;
  moderationStatus?: "active" | "suspended" | "banned";
}

export interface ReportListItem {
  id: string;
  category: string;
  categoryLabel: string;
  details: string;
  status: ReportStatus;
  priority: ReportPriority;
  createdAt: string;
  reporter: PersonSummary;
  reported: PersonSummary;
  evidenceCount: number;
  assignedAdmin?: string;
  meetupId?: string;
  targetType: "member" | "meetup";
}

export interface EvidenceItem {
  id: string;
  type: "message" | "image" | "context" | "meetup";
  label: string;
  body?: string;
  createdAt?: string;
  signedUrl?: string;
  mediaType?: "image" | "video";
}

export interface MeetupReportSnapshot {
  id: string;
  title: string;
  category: string;
  generalArea: string;
  startsAt: string;
  effectiveEnd: string;
  accessMode: "open" | "private";
  locationVisibility: "public" | "protected";
  lifecycle: string;
  moderationStatus: string;
  participantCount: number;
  capacity?: number;
  adultExplicit: boolean;
}

export interface MeetupLocationEvidence {
  reportId: string;
  meetupId: string;
  venueLabel?: string;
  address?: string;
  arrivalInstructions?: string;
  latitude: number;
  longitude: number;
  accessedAt: string;
}

export interface ReportDetail extends ReportListItem {
  conversationId?: string;
  messageId?: string;
  resolutionNotes?: string;
  evidence: EvidenceItem[];
  meetupSnapshot?: MeetupReportSnapshot;
}

export interface PhotoReviewItem {
  id: string;
  storagePath: string;
  signedUrl?: string;
  position: number;
  createdAt: string;
  profile: PersonSummary;
  safetySignals: string[];
}

export interface AuditEvent {
  id: string;
  actorName: string;
  action: string;
  actionLabel: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface DashboardStats {
  openReports: number;
  urgentReports: number;
  pendingPhotos: number;
  actionsToday: number;
  medianResponseMinutes: number;
  reviewCoverage: number;
}

export interface AdminDashboardData {
  stats: DashboardStats;
  reports: ReportListItem[];
  photos: PhotoReviewItem[];
  audit: AuditEvent[];
}
