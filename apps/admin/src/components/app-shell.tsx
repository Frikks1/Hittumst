"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import type { CurrentAdmin } from "@/lib/auth/session";
import { BrandMark } from "./brand-mark";
import { Icons } from "./icon";

const navigation = [
  { href: "/attendance-reviews", label: "Attendance review", icon: Icons.FileSearch },
  { href: "/diagnosis-review", label: "Diagnosis review", icon: Icons.FileSearch },
  { href: "/dashboard", label: "Overview", icon: Icons.LayoutDashboard },
  { href: "/reports", label: "Reports", icon: Icons.MessageSquareWarning },
  { href: "/photos", label: "Photo review", icon: Icons.ImageIcon },
  { href: "/media-appeals", label: "Media appeals", icon: Icons.ImageIcon },
  { href: "/finance", label: "Finance review", icon: Icons.FileSearch },
  { href: "/audit", label: "Audit log", icon: Icons.FileSearch },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="side-nav" aria-label="Safety desk">
      <span className="nav-label">Workspace</span>
      {navigation.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ admin, children }: { admin: CurrentAdmin; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-frame">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <BrandMark />
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icons.X aria-hidden="true" />
          </button>
        </div>
        <Navigation onNavigate={() => setOpen(false)} />
        <div className="sidebar-foot">
          {admin.demo && (
            <div className="demo-sidebar-note">
              <Icons.Sparkles aria-hidden="true" />
              <div><strong>Demo data</strong><span>No live accounts</span></div>
            </div>
          )}
          <div className="staff-card">
            <span className="staff-avatar" aria-hidden="true">{admin.name.slice(0, 1).toLocaleUpperCase("is-IS")}</span>
            <div>
              <strong>{admin.name}</strong>
              <span>{admin.role.replace("_", " ")}</span>
            </div>
            <form action="/auth/signout" method="post">
              <button className="icon-button" type="submit" aria-label="Sign out">
                <Icons.LogOut aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="workspace">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icons.Menu aria-hidden="true" />
          </button>
          <BrandMark compact />
          <span className="staff-avatar" aria-hidden="true">{admin.name.slice(0, 1)}</span>
        </header>
        {children}
      </div>
    </div>
  );
}
