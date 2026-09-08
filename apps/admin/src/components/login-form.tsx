"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Icons } from "./icon";

export function LoginForm({ demo, appUrl }: { demo: boolean; appUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      router.push("/dashboard");
      return;
    }

    setBusy(true);
    setMessage(null);
    const supabase = createClient();

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback?next=/dashboard`,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSent(true);
    setMessage("A secure sign-in link has been sent to your staff email.");
  }

  if (demo) {
    return (
      <div className="demo-login-card">
        <span className="demo-chip"><Icons.Sparkles aria-hidden="true" /> Demo workspace</span>
        <p>Explore a realistic, non-production moderation queue. No account or data connection is required.</p>
        <Link className="button button-primary button-wide" href="/dashboard">
          Enter demo safety desk <Icons.ChevronRight aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>Staff email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Password <small>optional</small></span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Leave blank for a secure email link"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {message && (
        <div className={`form-message ${sent ? "form-message-success" : ""}`} role="status">
          {message}
        </div>
      )}
      <button className="button button-primary button-wide" type="submit" disabled={busy || sent}>
        {busy ? "Checking access…" : password ? "Sign in" : "Send secure link"}
        {!busy && <Icons.ChevronRight aria-hidden="true" />}
      </button>
      <p className="form-caption">
        Continuing confirms this is your individual staff account. Activity is logged.
      </p>
    </form>
  );
}
