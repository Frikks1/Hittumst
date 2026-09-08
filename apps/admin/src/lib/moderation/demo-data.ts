import type {
  AdminDashboardData,
  AuditEvent,
  PhotoReviewItem,
  ReportDetail,
  ReportListItem,
} from "./types";

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const demoReports: ReportListItem[] = [
  {
    id: "rpt-2408",
    category: "threats",
    categoryLabel: "Threat or intimidation",
    details: "Reporter describes repeated threats after declining to meet.",
    status: "open",
    priority: "critical",
    createdAt: ago(18),
    reporter: {
      id: "usr-elva",
      displayName: "Elva",
      initials: "EL",
      region: "Höfuðborgarsvæðið",
    },
    reported: {
      id: "usr-hrafn",
      displayName: "Hrafn",
      initials: "HR",
      region: "Höfuðborgarsvæðið",
      age: 29,
      identity: "Queer",
      moderationStatus: "active",
    },
    evidenceCount: 4,
    targetType: "member",
  },
  {
    id: "rpt-2407",
    category: "impersonation",
    categoryLabel: "Impersonation",
    details: "Profile photos appear to belong to a public social account.",
    status: "in_review",
    priority: "urgent",
    createdAt: ago(61),
    reporter: {
      id: "usr-kari",
      displayName: "Kári",
      initials: "KÁ",
      region: "Suðurnes",
    },
    reported: {
      id: "usr-aron",
      displayName: "Aron",
      initials: "AR",
      region: "Suðurnes",
      age: 34,
      identity: "Gay",
      moderationStatus: "active",
    },
    evidenceCount: 2,
    assignedAdmin: "Sólveig",
    targetType: "member",
  },
  {
    id: "rpt-2406",
    category: "dangerous_location",
    categoryLabel: "Dangerous or misleading location",
    details: "The protected arrival instructions directed participants to an unsafe structure.",
    status: "open",
    priority: "urgent",
    createdAt: ago(132),
    reporter: {
      id: "usr-brynjar",
      displayName: "Brynjar",
      initials: "BR",
      region: "Norðurland eystra",
    },
    reported: {
      id: "usr-david",
      displayName: "Davíð",
      initials: "DA",
      region: "Norðurland eystra",
      age: 26,
      identity: "Bi",
      moderationStatus: "active",
    },
    evidenceCount: 7,
    meetupId: "meetup-demo-1",
    targetType: "meetup",
  },
  {
    id: "rpt-2405",
    category: "spam",
    categoryLabel: "Spam or scam",
    details: "Repeated links to an external payment page.",
    status: "resolved",
    priority: "standard",
    createdAt: ago(340),
    reporter: {
      id: "usr-aldis",
      displayName: "Aldís",
      initials: "AL",
      region: "Vesturland",
    },
    reported: {
      id: "usr-demo",
      displayName: "Account 847",
      initials: "84",
      moderationStatus: "banned",
    },
    evidenceCount: 3,
    assignedAdmin: "Sólveig",
    targetType: "member",
  },
];

export const demoPhotos: PhotoReviewItem[] = [
  {
    id: "photo-491",
    storagePath: "profiles/usr-una/cover.jpg",
    position: 1,
    createdAt: ago(12),
    profile: {
      id: "usr-una",
      displayName: "Una",
      initials: "UN",
      age: 31,
      region: "Höfuðborgarsvæðið",
      identity: "Lesbian",
    },
    safetySignals: ["New account", "Primary photo"],
  },
  {
    id: "photo-490",
    storagePath: "profiles/usr-loi/profile-2.jpg",
    position: 2,
    createdAt: ago(27),
    profile: {
      id: "usr-loi",
      displayName: "Lói",
      initials: "LÓ",
      age: 25,
      region: "Suðurland",
      identity: "Non-binary",
    },
    safetySignals: ["Second photo"],
  },
  {
    id: "photo-489",
    storagePath: "profiles/usr-einar/cover.jpg",
    position: 1,
    createdAt: ago(43),
    profile: {
      id: "usr-einar",
      displayName: "Einar",
      initials: "EI",
      age: 38,
      region: "Austurland",
      identity: "Gay",
    },
    safetySignals: ["Primary photo", "Previous rejection"],
  },
];

export const demoAudit: AuditEvent[] = [
  {
    id: "audit-933",
    actorName: "Sólveig",
    action: "profile.warned",
    actionLabel: "Warning issued",
    targetType: "profile",
    targetId: "usr-david",
    details: "Harassment policy reminder sent; report remains under review.",
    createdAt: ago(36),
  },
  {
    id: "audit-932",
    actorName: "Jón",
    action: "photo.approved",
    actionLabel: "Photo approved",
    targetType: "profile_photo",
    targetId: "photo-488",
    details: "Identity and community guideline checks completed.",
    createdAt: ago(74),
  },
  {
    id: "audit-931",
    actorName: "Sólveig",
    action: "profile.banned",
    actionLabel: "Account banned",
    targetType: "profile",
    targetId: "usr-demo",
    details: "Coordinated payment scam; linked open reports resolved.",
    createdAt: ago(188),
  },
  {
    id: "audit-930",
    actorName: "Embla",
    action: "report.assigned",
    actionLabel: "Report assigned",
    targetType: "report",
    targetId: "rpt-2407",
    details: "Impersonation review assigned to Sólveig.",
    createdAt: ago(224),
  },
];

export function getDemoReport(id: string): ReportDetail | null {
  const report = demoReports.find((item) => item.id === id);
  if (!report) return null;

  return {
    ...report,
    conversationId: "conv-demo-24",
    messageId: "msg-demo-77",
    resolutionNotes:
      report.status === "resolved"
        ? "Evidence reviewed and enforcement completed."
        : undefined,
    evidence: [
      {
        id: "evidence-1",
        type: "message",
        label: "Reported message",
        body: "Message retained for safety review. Sensitive content is hidden in this demo.",
        createdAt: ago(22),
      },
      {
        id: "evidence-2",
        type: "context",
        label: "Conversation context",
        body: "Three preceding and three following messages were preserved for context.",
        createdAt: ago(21),
      },
    ],
    meetupSnapshot: report.meetupId
      ? {
          id: report.meetupId,
          title: "Kvöldhittingur í borginni",
          category: "social",
          generalArea: "Miðborg Reykjavíkur",
          startsAt: new Date(Date.now() + 3_600_000).toISOString(),
          effectiveEnd: new Date(Date.now() + 13 * 3_600_000).toISOString(),
          accessMode: "private",
          locationVisibility: "protected",
          lifecycle: "published",
          moderationStatus: "active",
          participantCount: 8,
          capacity: 12,
          adultExplicit: false,
        }
      : undefined,
  };
}

export function getDemoDashboard(): AdminDashboardData {
  return {
    stats: {
      openReports: 12,
      urgentReports: 2,
      pendingPhotos: 8,
      actionsToday: 17,
      medianResponseMinutes: 24,
      reviewCoverage: 93,
    },
    reports: demoReports,
    photos: demoPhotos,
    audit: demoAudit,
  };
}
