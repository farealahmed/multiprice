import type { NextConfig } from 'next';

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? 'http://localhost:3001';

/**
 * Same-origin proxy.
 *
 * The browser only ever calls `/api/...` and `/auth/...` (relative). Next
 * rewrites those to the backend, so the browser is always same-origin. No CORS,
 * no cross-site cookies, no NEXT_PUBLIC_API_URL.
 */
const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${BACKEND_ORIGIN}/auth/:path*`,
      },
    ];
  },
};

export default config;