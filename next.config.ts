import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // Baseline for every response (SEC-014). Later entries override the same key,
      // so booking pages keep their stricter referrer policy below.
      { source: "/:path*", headers: securityHeaders(process.env) },
      // These headers also replace the ones a route handler sets itself, and several
      // handlers rely on no-referrer: keep it for the whole API.
      { source: "/api/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      ...["/events/:path*", "/reservations/:path*"].map(source => ({ source, headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] })),
    ];
  },
  serverExternalPackages: ['libheif-js'],
  outputFileTracingIncludes: {
    '/api/profile-photo': ['lib/server/heic-worker.mjs', 'node_modules/libheif-js/**/*'],
    // The native worker is outside the bundle, so include its Sharp runtime too.
    '/api/profile-photo/prepare': ['lib/server/heic-worker.mjs', 'node_modules/libheif-js/**/*',
      'node_modules/sharp/**/*', 'node_modules/@img/**/*',
      'node_modules/detect-libc/**/*', 'node_modules/semver/**/*'],
  },
};

export default nextConfig;
