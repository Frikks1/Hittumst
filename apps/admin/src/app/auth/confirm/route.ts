import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = getRuntimeConfig();
  if (config.mode === "demo") {
    return NextResponse.redirect(new URL("/dashboard", url.origin));
  }

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/dashboard", url.origin));
  }
  return NextResponse.redirect(new URL("/login?reason=invalid-link", url.origin));
}
