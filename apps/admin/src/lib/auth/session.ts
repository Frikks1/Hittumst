import { redirect } from "next/navigation";

import { getRuntimeConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  getRolesFromAppMetadata,
  highestRole,
  type StaffRole,
} from "./roles";

export interface CurrentAdmin {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  roles: StaffRole[];
  demo: boolean;
}

const demoAdmin: CurrentAdmin = {
  id: "demo-admin",
  email: "moderation@rummal.is",
  name: "Sólveig",
  role: "admin",
  roles: ["admin"],
  demo: true,
};

export async function getStaffSession(): Promise<(CurrentAdmin & { mfaRequired: boolean }) | null> {
  const config = getRuntimeConfig();
  if (config.mode === "demo") return { ...demoAdmin, mfaRequired: false };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_staff_access');
  if (error || !data || typeof data !== 'object') return null;
  const staff = data as Record<string, unknown>;
  const roles = getRolesFromAppMetadata({ roles: staff.roles });
  const role = highestRole(roles);
  if (!role || typeof staff.id !== 'string') return null;
  const email = typeof staff.email === 'string' ? staff.email : 'Staff account';

  return {
    id: staff.id,
    email,
    name: typeof staff.name === 'string' ? staff.name : email.split('@')[0],
    role,
    roles,
    demo: false,
    mfaRequired: staff.mfaRequired !== false,
  };
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const staff = await getStaffSession();
  return staff && !staff.mfaRequired ? staff : null;
}

export async function requireAdmin() {
  const admin = await getStaffSession();
  if (!admin) redirect("/login?reason=staff-only");
  if (admin.mfaRequired) redirect('/mfa');
  return admin;
}
