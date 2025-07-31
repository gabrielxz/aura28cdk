import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  compress: false, // CloudFront will handle compression
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
