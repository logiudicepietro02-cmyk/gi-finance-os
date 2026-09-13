import type { NextConfig } from "next";

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 25);

const nextConfig: NextConfig = {
  // Separate build directory for the isolated E2E server (see scripts/e2e-server.mjs)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["unpdf", "pdf-lib"],
  experimental: {
    // Requests pass through proxy.ts: allow PDF uploads up to the configured limit.
    proxyClientMaxBodySize: `${maxUploadMb + 2}mb`,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
