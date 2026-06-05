import type { NextConfig } from "next";
import { getAllowedDevOrigins } from "./lib/app-origin";

const nextConfig: NextConfig = {
  // Allow LAN IP access in dev (Next.js 16 blocks cross-origin dev assets by default).
  allowedDevOrigins: getAllowedDevOrigins(),
  images: {
    qualities: [75, 90],
  },
  async redirects() {
    return [
      { source: "/client-replenishment", destination: "/replenishment/client", permanent: true },
      { source: "/stock-replenishment", destination: "/replenishment/stock", permanent: true },
      { source: "/replenishment-history", destination: "/replenishment/client", permanent: true },
      { source: "/replenishment", destination: "/replenishment/client", permanent: true },
      { source: "/users", destination: "/admin/users", permanent: true },
      { source: "/roles", destination: "/admin/roles", permanent: true },
    ];
  },
};

export default nextConfig;
