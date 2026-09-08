import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

function safeDestination(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes('\\')
    ? value : "/dashboard";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = getRuntimeConfig();
  if (config.mode === "demo") {
    return NextResponse.redirect(new URL("/dashboard", url.origin));
  }

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(
        new URL(safeDestination(url.searchParams.get("next")), url.origin),
      );
    }
  }
  return NextResponse.redirect(new URL("/login?reason=invalid-link", url.origin));
}
