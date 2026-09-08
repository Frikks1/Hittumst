import { describe, expect, it } from "vitest";

import {
  normalizeMeetupLocationEvidence,
  normalizeReportDetail,
  reportPriority,
} from "./repository";

describe("canonical report priority", () => {
  it.each([
    "minor_suspected",
    "csam",
    "threat",
    "ncii",
    "coercion_non_consent",
    "trafficking_exploitation",
  ])("treats %s as critical", (category) => {
    expect(reportPriority({}, category)).toBe("critical");
  });

  it.each(["harassment", "hate_discrimination", "dangerous_location"])(
    "treats %s as urgent priority",
    (category) => {
      expect(reportPriority({}, category)).toBe("urgent");
    },
  );

  it("honors an explicit server priority", () => {
    expect(reportPriority({ priority: "critical" }, "other")).toBe("critical");
  });

  it("keeps legacy impersonation urgent without escalating material misrepresentation", () => {
    expect(reportPriority({}, "impersonation")).toBe("urgent");
    expect(reportPriority({}, "misrepresentation")).toBe("standard");
  });
});

describe("meetup evidence normalization", () => {
  it("adds report-scoped room-message and series evidence to the case", () => {
    const detail = normalizeReportDetail({
      report: {
        id: "report-room",
        reporter_id: "reporter-1",
        reported_id: "member-2",
        meetup_id: "meetup-1",
        category: "harassment",
        status: "open",
        created_at: "2026-09-04T01:00:00.000Z",
      },
      room_message_evidence: {
        message_id: "message-1",
        body: "Case-scoped message body",
        created_at: "2026-09-04T00:59:00.000Z",
      },
      series_evidence: {
        series_id: "series-1",
        title: "Weekly gathering",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(detail.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "message-1", label: "Reported Hittingur room message" }),
      expect.objectContaining({ id: "series-1", label: "Meetup series context" }),
    ]));
  });

  it("reads the nested camelCase snapshot returned by the report RPC", () => {
    const detail = normalizeReportDetail({
      report: {
        id: "report-1",
        reporter_id: "reporter-1",
        reported_id: "host-1",
        meetup_id: "meetup-1",
        category: "dangerous_location",
        status: "open",
        created_at: "2026-08-31T20:00:00.000Z",
      },
      meetup_evidence: {
        revisionId: 7,
        snapshot: {
          id: "meetup-1",
          title: "Safe title",
          category: "community",
          generalArea: { labelEn: "Reykjavík" },
          startsAt: "2026-09-02T20:00:00.000Z",
          effectiveEnd: "2026-09-03T08:00:00.000Z",
          accessMode: "private",
          locationVisibility: "protected",
          status: "published",
          participantCount: 4,
          capacity: 12,
          isExplicit: false,
        },
      },
    });

    expect(detail.meetupSnapshot).toMatchObject({
      id: "meetup-1",
      title: "Safe title",
      generalArea: "Reykjavík",
      startsAt: "2026-09-02T20:00:00.000Z",
      participantCount: 4,
      capacity: 12,
    });
  });

  it("reads exact evidence only from the audited RPC's nested location", () => {
    const evidence = normalizeMeetupLocationEvidence(
      {
        reportId: "report-1",
        meetupId: "meetup-1",
        capturedAt: "2026-08-31T20:00:00.000Z",
        exactLocation: {
          latitude: 64.1466,
          longitude: -21.9426,
          venueName: "Venue",
          address: "Address",
        },
        arrivalInstructions: "Use the side door",
      },
      "fallback-report",
    );

    expect(evidence).toEqual({
      reportId: "report-1",
      meetupId: "meetup-1",
      venueLabel: "Venue",
      address: "Address",
      arrivalInstructions: "Use the side door",
      latitude: 64.1466,
      longitude: -21.9426,
      accessedAt: "2026-08-31T20:00:00.000Z",
    });
  });
});
