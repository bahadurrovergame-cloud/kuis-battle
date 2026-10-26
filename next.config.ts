import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Tetap validasi tipe TypeScript saat build
    ignoreBuildErrors: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ['192.168.1.10', 'localhost', '127.0.0.1'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;

