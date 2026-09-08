import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { normalizeReportCategory } from "@rummal/shared";
import {
  demoAudit,
  demoPhotos,
  demoReports,
  getDemoDashboard,
  getDemoReport,
} from "./demo-data";
import type {
  AdminDashboardData,
  AuditEvent,
  EvidenceItem,
  MeetupLocationEvidence,
  MeetupReportSnapshot,
  PersonSummary,
  PhotoReviewItem,
  ReportDetail,
  ReportListItem,
  ReportPriority,
  ReportStatus,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const categoryLabels: Record<string, string> = {
  threat: "Threat or intimidation",
  threats: "Threat or intimidation",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  impersonation: "Impersonation",
  underage: "Suspected minor",
  non_consensual_intimate_media: "Non-consensual intimate imagery",
  ncii: "Non-consensual intimate imagery",
  minor_suspected: "Suspected minor",
  csam: "Suspected child sexual abuse material",
  scam: "Spam or scam",
  spam: "Spam or scam",
  coercion_non_consent: "Coercion or non-consent",
  dangerous_location: "Dangerous or misleading location",
  misrepresentation: "Material misrepresentation",
  hate_discrimination: "Hate or discrimination",
  spam_advertising: "Spam or advertising",
  trafficking_exploitation: "Trafficking or exploitation",
  illegal_activity: "Illegal activity",
  compensated_sexual_services: "Compensated sexual services",
  other: "Other safety concern",
};

const actionLabels: Record<string, string> = {
  "profile.warned": "Warning issued",
  "profile.suspended": "Account suspended",
  "profile.banned": "Account banned",
  "photo.approved": "Photo approved",
  "photo.rejected": "Photo rejected",
  "report.resolved": "Report resolved",
  "report.dismissed": "Report dismissed",
  "report.note_added": "Case note added",
  "meetup.removed": "Meetup removed",
  "meetup.restored": "Meetup restored",
  "meetup.host_restricted": "Host creation restricted",
  "meetup.location_evidence_accessed": "Protected location evidence accessed",
  "meetup.room_message_hidden": "Room message hidden",
  "meetup.room_locked": "Occurrence room locked",
  "meetup.participant_removed": "Participant removed",
  "meetup.series_removed": "Meetup series removed",
};

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function itemsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const payload = record(value);
  for (const key of ["items", "results", "data", "reports", "photos", "events"]) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }
  return [];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("is-IS"))
    .join("") || "RM";
}

function ageFromDate(date: unknown) {
  if (typeof date !== "string") return undefined;
  const birth = new Date(date);
  if (Number.isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function person(value: unknown, idFallback: unknown, nameFallback: string): PersonSummary {
  const row = record(value);
  const displayName = string(row.display_name ?? row.displayName, nameFallback);
  const identityTags = strings(row.identity_tags ?? row.identityTags);
  const moderation = string(row.moderation_status ?? row.moderationStatus);
  return {
    id: string(row.id ?? idFallback, "unknown"),
    displayName,
    initials: initials(displayName),
    region: string(row.region) || undefined,
    age: number(row.age) || ageFromDate(row.date_of_birth),
    identity: string(row.identity) || identityTags[0],
    moderationStatus: ["active", "suspended", "banned"].includes(moderation)
      ? (moderation as PersonSummary["moderationStatus"])
      : undefined,
  };
}

export function reportPriority(row: UnknownRecord, category: string): ReportPriority {
  const provided = string(row.priority);
  if (["critical", "urgent", "standard"].includes(provided)) {
    return provided as ReportPriority;
  }
  if (provided === "high") return "urgent";
  if (provided === "normal") return "standard";
  const canonical = normalizeReportCategory(category) ?? category;
  if ([
    "minor_suspected",
    "csam",
    "threat",
    "ncii",
    "coercion_non_consent",
    "trafficking_exploitation",
  ].includes(canonical)) {
    return "critical";
  }
  if ([
    "harassment",
    "hate_discrimination",
    "dangerous_location",
  ].includes(canonical) || category === "impersonation") return "urgent";
  return "standard";
}

function normalizeReport(value: unknown): ReportListItem {
  const row = record(value);
  const category = string(row.category, "other");
  const rawStatus = string(row.status, "open");
  const status = ["open", "in_review", "resolved", "dismissed"].includes(rawStatus)
    ? (rawStatus as ReportStatus)
    : "open";
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];

  return {
    id: string(row.id, "unknown-report"),
    category,
    categoryLabel: categoryLabels[category] ?? category.replaceAll("_", " "),
    details: string(row.details, "No additional details supplied."),
    status,
    priority: reportPriority(row, category),
    createdAt: string(row.created_at ?? row.createdAt, new Date().toISOString()),
    reporter: person(
      row.reporter_profile ?? row.reporter,
      row.reporter_id,
      "Anonymous reporter",
    ),
    reported: person(
      row.reported_profile ?? row.reported,
      row.reported_id,
      "Reported member",
    ),
    evidenceCount: number(row.evidence_count, evidence.length),
    assignedAdmin:
      string(row.assigned_admin_name ?? row.assigned_admin) || undefined,
    meetupId: string(row.meetup_id) || undefined,
    targetType: string(row.meetup_id) ? "meetup" : "member",
  };
}

export function normalizeMeetupSnapshot(value: unknown): MeetupReportSnapshot | undefined {
  const row = record(value);
  const id = string(row.id ?? row.meetup_id);
  if (!id) return undefined;
  const generalArea = record(row.generalArea ?? row.general_area);
  const lifecycle = string(row.lifecycle ?? row.status, "unknown");
  return {
    id,
    title: string(row.title, "Untitled meetup"),
    category: string(row.category, "other"),
    generalArea: string(
      generalArea.labelEn ??
        generalArea.labelIs ??
        row.generalAreaName ??
        row.general_area_name ??
        row.generalAreaId ??
        row.general_area,
      "Area withheld",
    ),
    startsAt: string(row.startsAt ?? row.starts_at ?? row.start_at),
    effectiveEnd: string(row.effectiveEnd ?? row.effective_end),
    accessMode: string(row.accessMode ?? row.access_mode) === "private" ? "private" : "open",
    locationVisibility:
      string(row.locationVisibility ?? row.location_visibility) === "protected"
        ? "protected"
        : "public",
    lifecycle,
    moderationStatus: string(
      row.moderationStatus ?? row.moderation_status,
      lifecycle === "moderation_hidden" ? "removed" : "visible",
    ),
    participantCount: number(row.participantCount ?? row.participant_count),
    capacity: number(row.capacity) || undefined,
    adultExplicit: (row.isExplicit ?? row.adult_explicit) === true,
  };
}

function normalizeEvidence(value: unknown, index: number): EvidenceItem {
  const row = record(value);
  const rawType = string(row.type, "context");
  return {
    id: string(row.id, `evidence-${index}`),
    type: ["message", "image", "context"].includes(rawType)
      ? (rawType as EvidenceItem["type"])
      : "context",
    label: string(row.label, "Supporting context"),
    body: string(row.body ?? row.content) || undefined,
    createdAt: string(row.created_at ?? row.createdAt) || undefined,
  };
}

export function normalizeReportDetail(value: unknown): ReportDetail {
  const row = record(value);
  const reportRow = record(row.report ?? row);
  const base = normalizeReport(reportRow);
  const evidence: EvidenceItem[] = Array.isArray(row.evidence)
    ? row.evidence.map(normalizeEvidence)
    : [];
  const message = record(row.message_evidence);
  if (string(message.id)) evidence.push({
    id: string(message.id), type: string(message.image_path) ? "image" : "message",
    label: "Reported message", body: string(message.body) || undefined,
    createdAt: string(message.created_at) || undefined,
  });
  const roomMessage = record(row.room_message_evidence ?? row.roomMessageEvidence);
  if (string(roomMessage.message_id ?? roomMessage.id)) evidence.push({
    id: string(roomMessage.message_id ?? roomMessage.id),
    type: "message",
    label: "Reported Hittingur room message",
    body: string(roomMessage.body) || undefined,
    createdAt: string(roomMessage.created_at ?? roomMessage.createdAt) || undefined,
  });
  const series = record(row.series_evidence ?? row.seriesEvidence);
  if (string(series.id ?? series.series_id)) evidence.push({
    id: string(series.id ?? series.series_id),
    type: "context",
    label: "Meetup series context",
    body: string(series.title) || undefined,
    createdAt: string(series.created_at ?? series.createdAt) || undefined,
  });
  const album = record(row.album_evidence);
  if (string(album.item_id)) evidence.push({
    id: string(album.item_id), type: "image", label: "Reported private album item",
    mediaType: string(album.media_type) === "video" ? "video" : "image",
  });
  return {
    ...base,
    reporter: person(row.reporter_profile, reportRow.reporter_id, "Anonymous reporter"),
    reported: person(row.reported_profile, reportRow.reported_id, "Reported member"),
    evidenceCount: Math.max(base.evidenceCount, evidence.length),
    conversationId: string(row.conversation_id ?? row.conversationId) || undefined,
    messageId: string(row.message_id ?? row.messageId) || undefined,
    resolutionNotes:
      string(row.resolution_notes ?? row.resolutionNotes) || undefined,
    evidence,
    meetupId: string(reportRow.meetup_id ?? row.meetup_id) || base.meetupId,
    targetType: string(reportRow.meetup_id ?? row.meetup_id) ? "meetup" : base.targetType,
    meetupSnapshot: normalizeMeetupSnapshot(
      record(row.meetup_evidence ?? row.meetupEvidence).snapshot ??
        row.meetup_snapshot ??
        row.meetupSnapshot,
    ),
  };
}

export function normalizeMeetupLocationEvidence(
  value: unknown,
  fallbackReportId: string,
  fallbackAccessedAt = new Date().toISOString(),
): MeetupLocationEvidence {
  const row = record(value);
  const exactLocation = record(row.exactLocation ?? row.exact_location);
  return {
    reportId: string(row.reportId ?? row.report_id, fallbackReportId),
    meetupId: string(row.meetupId ?? row.meetup_id),
    venueLabel:
      string(
        exactLocation.venueName ??
          exactLocation.venue_label ??
          row.venueLabel ??
          row.venue_label,
      ) || undefined,
    address: string(exactLocation.address ?? row.address) || undefined,
    arrivalInstructions:
      string(row.arrivalInstructions ?? row.arrival_instructions) || undefined,
    latitude: number(exactLocation.latitude ?? row.latitude),
    longitude: number(exactLocation.longitude ?? row.longitude),
    accessedAt: string(
      row.accessedAt ?? row.accessed_at ?? row.capturedAt ?? row.captured_at,
      fallbackAccessedAt,
    ),
  };
}

function normalizePhoto(value: unknown): PhotoReviewItem {
  const row = record(value);
  return {
    id: string(row.id, "unknown-photo"),
    storagePath: string(row.storage_path ?? row.storagePath),
    signedUrl: string(row.signed_url ?? row.signedUrl) || undefined,
    position: number(row.position, 1),
    createdAt: string(row.created_at ?? row.createdAt, new Date().toISOString()),
    profile: person(row.profile, row.profile_id, "Member"),
    safetySignals: strings(row.safety_signals ?? row.safetySignals),
  };
}

function normalizeAudit(value: unknown): AuditEvent {
  const row = record(value);
  const action = string(row.action, "case.updated");
  const detailsRecord = record(row.details);
  return {
    id: string(row.id, "unknown-event"),
    actorName: string(
      row.actor_name ?? record(row.actor).display_name,
      "Hittumst staff",
    ),
    action,
    actionLabel: actionLabels[action] ?? action.replaceAll(/[._]/g, " "),
    targetType: string(row.target_type, "record"),
    targetId: string(row.target_id, "unknown"),
    details: string(
      row.summary ?? detailsRecord.summary ?? detailsRecord.reason,
      "Administrative action recorded.",
    ),
    createdAt: string(row.created_at ?? row.createdAt, new Date().toISOString()),
  };
}

async function rpc(name: string, args: UnknownRecord) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return { data, supabase };
}

export async function getReports(status?: ReportStatus): Promise<ReportListItem[]> {
  if (isDemoMode()) {
    return status ? demoReports.filter((report) => report.status === status) : demoReports;
  }
  const { data } = await rpc("admin_list_reports", {
    p_status: status ?? null,
    p_limit: 50,
    p_cursor: null,
  });
  return itemsFrom(data).map(normalizeReport);
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  if (isDemoMode()) return getDemoReport(id);
  const { data, supabase } = await rpc("admin_get_report", { p_report_id: id });
  if (!data) return null;
  const detail = normalizeReportDetail(data);
  const album = record(record(data).album_evidence);
  const path = string(album.storage_path);
  if (path) {
    const { data: signed } = await supabase.storage.from("album-media").createSignedUrl(path, 60);
    const item = detail.evidence.find((entry) => entry.id === string(album.item_id));
    if (item) item.signedUrl = signed?.signedUrl;
  }
  return detail;
}

export async function getMeetupLocationEvidence(
  reportId: string,
  reason: string,
): Promise<MeetupLocationEvidence> {
  if (isDemoMode()) {
    return {
      reportId,
      meetupId: "meetup-demo-1",
      venueLabel: "Demo venue",
      address: "Demo address — no real location",
      arrivalInstructions: "Demo evidence only. No address was retrieved.",
      latitude: 64.1466,
      longitude: -21.9426,
      accessedAt: new Date().toISOString(),
    };
  }
  const { data } = await rpc("admin_get_meetup_location_evidence", {
    p_report_id: reportId,
    p_reason: reason,
  });
  return normalizeMeetupLocationEvidence(data, reportId);
}

export async function getPendingPhotos(): Promise<PhotoReviewItem[]> {
  if (isDemoMode()) return demoPhotos;
  const { data, supabase } = await rpc("admin_list_pending_photos", {
    p_limit: 50,
    p_cursor: null,
  });
  const photos = itemsFrom(data).map(normalizePhoto);

  return Promise.all(
    photos.map(async (photo) => {
      if (photo.signedUrl || !photo.storagePath) return photo;
      const { data: signed } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(photo.storagePath, 300);
      return { ...photo, signedUrl: signed?.signedUrl };
    }),
  );
}

export async function getAuditEvents(): Promise<AuditEvent[]> {
  if (isDemoMode()) return demoAudit;
  const { data } = await rpc("admin_list_audit_log", {
    p_limit: 50,
    p_cursor: null,
  });
  return itemsFrom(data).map(normalizeAudit);
}

export async function getDashboard(): Promise<AdminDashboardData> {
  if (isDemoMode()) return getDemoDashboard();

  const [reports, photos, audit] = await Promise.all([
    getReports(),
    getPendingPhotos(),
    getAuditEvents(),
  ]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    stats: {
      openReports: reports.filter((report) => report.status === "open").length,
      urgentReports: reports.filter(
        (report) => ["critical", "urgent"].includes(report.priority) && report.status !== "resolved",
      ).length,
      pendingPhotos: photos.length,
      actionsToday: audit.filter((event) => new Date(event.createdAt) >= today).length,
      medianResponseMinutes: 0,
      reviewCoverage: 0,
    },
    reports,
    photos,
    audit,
  };
}
