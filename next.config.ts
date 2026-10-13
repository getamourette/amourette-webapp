import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/events/:path*", "/reservations/:path*"].map(source => ({ source, headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }));
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
