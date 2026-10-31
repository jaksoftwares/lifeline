import { type NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The API is served under the same origin, so session cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  poweredByHeader: false,
  // Linting runs once for the whole monorepo (`pnpm lint`) with the root flat config.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Proxied bodies are cut at 10 MB by default, which would break oversized uploads instead of
    // letting the API answer "too large". Keep this well above the API's 10 MB attachment limit.
    middlewareClientMaxBodySize: '25mb',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
