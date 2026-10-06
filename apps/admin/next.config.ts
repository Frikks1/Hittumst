import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const workspaceRoot = path.resolve(__dirname, "../..");

// The Base44 preview serves this app from https://3000-<suffix> inside an iframe: dev
// assets and Server Actions are gated by that origin, and framing has to be allowed.
// The variable is unset everywhere else, so deployed behaviour is unchanged.
const previewHost = process.env.BASE44_PUBLIC_HOST_SUFFIX;
const previewOrigins = previewHost ? [`3000-${previewHost}`] : [];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: previewOrigins,
  experimental: { serverActions: { allowedOrigins: previewOrigins } },
  async headers() {
    const securityHeaders = [
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (!previewHost) securityHeaders.push({ key: "X-Frame-Options", value: "DENY" });
    return [{ source: "/(.*)", headers: securityHeaders }];
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
