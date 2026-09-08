import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine(value => { const url = new URL(value); return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash; }, "An HTTPS Supabase project URL is required"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/, "A publishable API key is required"),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email().optional(),
  NEXT_PUBLIC_RUMMAL_DEMO_MODE: z.enum(["true", "false"]).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export type RuntimeConfig =
  | { mode: "demo"; appUrl: string; supportEmail: string }
  | {
      mode: "supabase";
      appUrl: string;
      supabaseUrl: string;
      supabasePublishableKey: string;
      supportEmail: string;
    };

function rawEnvironment() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || undefined,
    NEXT_PUBLIC_RUMMAL_DEMO_MODE:
      process.env.NEXT_PUBLIC_RUMMAL_DEMO_MODE,
  };
}

export function getRuntimeConfig(): RuntimeConfig {
  const raw = rawEnvironment();
  const explicitlyDemo = raw.NEXT_PUBLIC_RUMMAL_DEMO_MODE === "true";
  const hasUrl = Boolean(raw.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (process.env.NODE_ENV === "production" && explicitlyDemo) throw new Error("Production admin cannot run in demo mode.");
  if (process.env.NODE_ENV === "production" && (!hasUrl || !hasKey)) throw new Error("Production admin backend must be configured.");

  if (explicitlyDemo || (!hasUrl && !hasKey)) {
    return {
      mode: "demo",
      appUrl: raw.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
      supportEmail: raw.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "",
    };
  }

  if (hasUrl !== hasKey) {
    throw new Error(
      "Supabase is partially configured. Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or neither for demo mode.",
    );
  }

  const parsed = publicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Hittumst admin environment: ${details}`);
  }

  return {
    mode: "supabase",
    appUrl: parsed.data.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supportEmail: parsed.data.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "",
  };
}

export function isDemoMode() {
  return getRuntimeConfig().mode === "demo";
}
