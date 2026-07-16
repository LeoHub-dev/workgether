import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Never reuse a stale RSC payload for dynamic pages (empty new-doc shell).
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  // Force a single Yjs instance — duplicate copies break CRDT sync (incl. bold/format).
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: path.resolve(rootDir, "node_modules/yjs"),
    };
    return config;
  },
};

export default nextConfig;
