import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getRuntimeConfig } from "@/lib/env";

export async function createClient() {
  const config = getRuntimeConfig();
  if (config.mode !== "supabase") {
    throw new Error("Supabase server client is unavailable in demo mode.");
  }

  const cookieStore = await cookies();

  return createServerClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) }) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes them.
          }
        },
      },
    },
  );
}
