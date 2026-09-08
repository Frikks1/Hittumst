"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getRuntimeConfig } from "@/lib/env";

export function createClient() {
  const config = getRuntimeConfig();
  if (config.mode !== "supabase") {
    throw new Error("Supabase browser client is unavailable in demo mode.");
  }

  return createBrowserClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
  );
}
