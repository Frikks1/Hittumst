export const staffRoles = ["moderator", "admin", "super_admin"] as const;

export type StaffRole = (typeof staffRoles)[number];

export type ModerationPermission =
  | "report.read"
  | "photo.review"
  | "member.warn"
  | "member.suspend"
  | "member.ban"
  | "meetup.manage"
  | "meetup.evidence"
  | "case.note"
  | "audit.read";

const rolePermissions: Record<StaffRole, readonly ModerationPermission[]> = {
  moderator: [
    "report.read",
    "photo.review",
    "member.warn",
    "meetup.manage",
    "meetup.evidence",
    "case.note",
    "audit.read",
  ],
  admin: [
    "report.read",
    "photo.review",
    "member.warn",
    "member.suspend",
    "member.ban",
    "meetup.manage",
    "meetup.evidence",
    "case.note",
    "audit.read",
  ],
  super_admin: [
    "report.read",
    "photo.review",
    "member.warn",
    "member.suspend",
    "member.ban",
    "meetup.manage",
    "meetup.evidence",
    "case.note",
    "audit.read",
  ],
};

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

export function getRolesFromAppMetadata(
  metadata: Record<string, unknown> | null | undefined,
): StaffRole[] {
  if (!metadata) return [];

  const candidates = [
    metadata.role,
    ...(Array.isArray(metadata.roles) ? metadata.roles : []),
  ];

  return [...new Set(candidates.filter(isStaffRole))];
}

export function isAdminMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  return getRolesFromAppMetadata(metadata).length > 0;
}

export function can(
  roles: readonly StaffRole[],
  permission: ModerationPermission,
) {
  return roles.some((role) => rolePermissions[role].includes(permission));
}

export function highestRole(roles: readonly StaffRole[]): StaffRole | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  return null;
}
