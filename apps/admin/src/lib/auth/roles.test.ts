import { describe, expect, it } from "vitest";

import {
  can,
  getRolesFromAppMetadata,
  highestRole,
  isAdminMetadata,
} from "./roles";

describe("admin app_metadata roles", () => {
  it("accepts only protected staff role values", () => {
    expect(
      getRolesFromAppMetadata({
        role: "moderator",
        roles: ["admin", "member", 7],
      }),
    ).toEqual(["moderator", "admin"]);
  });

  it("never treats absent or arbitrary metadata as staff", () => {
    expect(isAdminMetadata(undefined)).toBe(false);
    expect(isAdminMetadata({ role: "member" })).toBe(false);
    expect(isAdminMetadata({ admin: true })).toBe(false);
  });

  it("keeps high-risk actions away from moderators", () => {
    expect(can(["moderator"], "member.warn")).toBe(true);
    expect(can(["moderator"], "member.suspend")).toBe(false);
    expect(can(["moderator"], "member.ban")).toBe(false);
    expect(can(["admin"], "member.ban")).toBe(true);
  });

  it("chooses the strongest assigned role", () => {
    expect(highestRole(["moderator", "super_admin"])).toBe("super_admin");
    expect(highestRole([])).toBeNull();
  });
});
