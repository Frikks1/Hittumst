import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { Icons } from "@/components/icon";
import { LoginForm } from "@/components/login-form";
import { getStaffSession } from "@/lib/auth/session";
import { getRuntimeConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const [admin, params] = await Promise.all([getStaffSession(), searchParams]);
  if (admin) redirect(admin.mfaRequired ? '/mfa' : '/dashboard');
  const config = getRuntimeConfig();

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Hittumst Safety">
        <BrandMark />
        <div className="login-story-copy">
          <span className="eyebrow eyebrow-light">Hittumst operations</span>
          <h1>Care, clarity, and safer connections.</h1>
          <p>
            A focused workspace for the people protecting Iceland&apos;s queer community.
          </p>
        </div>
        <div className="login-pulse-card">
          <span className="pulse-dot" aria-hidden="true" />
          <div>
            <strong>Hittumst safety desk</strong>
            <span>Private access for approved staff</span>
          </div>
        </div>
        <p className="login-confidentiality">
          <Icons.LockKeyhole aria-hidden="true" /> Confidential staff system
        </p>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <BrandMark />
          </div>
          <span className="eyebrow">Protected access</span>
          <h2>Welcome back</h2>
          <p className="login-intro">
            Sign in with your approved Hittumst staff account. Access is checked against protected account roles.
          </p>
          {params.reason === "staff-only" && (
            <div className="notice notice-error" role="alert">
              <Icons.ShieldAlert aria-hidden="true" />
              <span>This account is not approved for the safety desk.</span>
            </div>
          )}
          <LoginForm demo={config.mode === "demo"} appUrl={config.appUrl} />
          <div className="login-help">
            <span>Access trouble?</span>
            {config.supportEmail ? <a href={`mailto:${config.supportEmail}`}>Contact the safety lead</a> : <span>Ask the appointed safety lead for access.</span>}
          </div>
        </div>
      </section>
    </main>
  );
}
