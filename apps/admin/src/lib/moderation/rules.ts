import { can, type ModerationPermission, type StaffRole } from "@/lib/auth/roles";

export const moderationActions = [
  "warn",
  "suspend",
  "ban",
  "note",
  "resolve",
  "dismiss",
  "meetup_remove",
  "meetup_restore",
  "host_restrict",
] as const;

export type ModerationAction = (typeof moderationActions)[number];

export interface ModerationActionInput {
  action: string;
  reason: string;
  suspensionDays?: number;
  profileId?: string;
  meetupId?: string;
  reportId: string;
}

export type ActionValidation =
  | {
      ok: true;
      value: ModerationActionInput & { action: ModerationAction };
      expiresAt?: string;
    }
  | { ok: false; errors: string[] };

const permissionByAction: Record<ModerationAction, ModerationPermission> = {
  warn: "member.warn",
  suspend: "member.suspend",
  ban: "member.ban",
  note: "case.note",
  resolve: "case.note",
  dismiss: "case.note",
  meetup_remove: "meetup.manage",
  meetup_restore: "meetup.manage",
  host_restrict: "meetup.manage",
};

export function permissionForAction(action: ModerationAction) {
  return permissionByAction[action];
}

export function validateModerationAction(
  input: ModerationActionInput,
  roles: readonly StaffRole[],
  now = new Date(),
): ActionValidation {
  const errors: string[] = [];
  if (!moderationActions.includes(input.action as ModerationAction)) {
    errors.push("Unknown moderation action.");
  }

  const action = input.action as ModerationAction;
  if (moderationActions.includes(action) && !can(roles, permissionForAction(action))) {
    errors.push("Your staff role cannot perform this action.");
  }

  if (!input.reportId) errors.push("A report is required.");
  if (["warn", "suspend", "ban"].includes(action) && !input.profileId) {
    errors.push("A reported member is required for this action.");
  }
  if (["meetup_remove", "meetup_restore", "host_restrict"].includes(action) && !input.meetupId) {
    errors.push("A meetup is required for this action.");
  }
  if (input.reason.trim().length < 8) {
    errors.push("Add a clear internal reason of at least 8 characters.");
  }

  let expiresAt: string | undefined;
  if (action === "suspend") {
    const days = input.suspensionDays;
    if (!Number.isInteger(days) || !days || days < 1 || days > 365) {
      errors.push("Suspensions must be between 1 and 365 days.");
    } else {
      expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();
    }
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { ...input, action }, expiresAt };
}
