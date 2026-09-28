import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const workspaceRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

const uploadSourceMaps = process.env.SENTRY_UPLOAD_SOURCEMAPS === "true";
if (uploadSourceMaps && (!process.env.SENTRY_AUTH_TOKEN || !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT))
  throw new Error("sentry_source_map_credentials_required");
export default uploadSourceMaps ? withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN, silent: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  webpack: { automaticVercelMonitors: false, autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false, autoInstrumentAppDirectory: false },
}) : nextConfig;
