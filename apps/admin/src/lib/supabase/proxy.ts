import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  const config = getRuntimeConfig();
  if (config.mode !== "supabase") return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims verifies the JWT and refreshes the cookie when required.
  await supabase.auth.getClaims();
  return response;
}
