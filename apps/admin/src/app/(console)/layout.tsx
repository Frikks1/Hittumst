import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/session";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return <AppShell admin={admin}>{children}</AppShell>;
}
