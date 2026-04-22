import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/WW-web",
  assetPrefix: "/WW-web",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
