import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['libheif-js'],
  outputFileTracingIncludes: {
    '/api/profile-photo': ['lib/server/heic-worker.mjs', 'node_modules/libheif-js/**/*'],
    '/api/profile-photo/prepare': ['lib/server/heic-worker.mjs', 'node_modules/libheif-js/**/*'],
  },
};

export default nextConfig;
