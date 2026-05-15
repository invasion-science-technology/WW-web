import type { NextConfig } from "next";

/**
 * Local dev: `npm run dev` (no STATIC_EXPORT) — site at `/`, no basePath.
 * GitHub Pages: CI sets STATIC_EXPORT=1 and NEXT_PUBLIC_BASE_PATH=/WW-web.
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.trim() ||
  (staticExport ? "/WW-web" : "");

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
