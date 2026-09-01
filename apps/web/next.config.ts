import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ftm/db', '@ftm/domain'],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
