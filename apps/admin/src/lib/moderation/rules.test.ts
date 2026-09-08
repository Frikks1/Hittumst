import { describe, expect, it } from "vitest";

import { validateModerationAction } from "./rules";

const base = {
  reportId: "report-1",
  profileId: "profile-1",
  reason: "Repeated targeted harassment in chat.",
};

describe("moderation action validation", () => {
  it("calculates a deterministic suspension end date", () => {
    const result = validateModerationAction(
      { ...base, action: "suspend", suspensionDays: 7 },
      ["admin"],
      new Date("2026-08-31T12:00:00.000Z"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.expiresAt).toBe("2026-09-07T12:00:00.000Z");
  });

  it("rejects unsafe or incomplete actions", () => {
    const result = validateModerationAction(
      { ...base, action: "suspend", reason: "short", suspensionDays: 0 },
      ["admin"],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain(
        "Add a clear internal reason of at least 8 characters.",
      );
      expect(result.errors).toContain(
        "Suspensions must be between 1 and 365 days.",
      );
    }
  });

  it("requires a member for member-level enforcement", () => {
    const result = validateModerationAction(
      { ...base, profileId: undefined, action: "ban" },
      ["admin"],
    );
    expect(result.ok).toBe(false);
  });

  it("allows case notes without a member target", () => {
    const result = validateModerationAction(
      { ...base, profileId: undefined, action: "note" },
      ["moderator"],
    );
    expect(result.ok).toBe(true);
  });

  it("requires meetup context for meetup enforcement", () => {
    const result = validateModerationAction(
      { ...base, action: "meetup_remove" },
      ["moderator"],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("A meetup is required for this action.");
  });

  it("allows an authorized moderator to remove a reported meetup", () => {
    const result = validateModerationAction(
      { ...base, meetupId: "meetup-1", action: "meetup_remove" },
      ["moderator"],
    );
    expect(result.ok).toBe(true);
  });
});
