import type { NextConfig } from "next";

/**
 * Read by vinext (the app runs on Cloudflare Workers, see vite.config.ts / cloudflare.config.ts).
 * No caching options: every page is per-guest and live, and the Worker has no cache backend.
 * Tailwind is processed by postcss.config.mjs.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
