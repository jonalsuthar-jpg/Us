import path from 'node:path';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  // Shared package ships TypeScript source; Next compiles it.
  transpilePackages: ['@us/shared'],
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Camera / mic / screen capture are first-party only.
        source: '/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), display-capture=(self)' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
