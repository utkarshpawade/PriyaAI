import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Pin the tracing root to the monorepo.
   *
   * Next infers it from the nearest lockfile, and in this environment that
   * search escapes the repo and lands in the Windows home directory, where
   * tracing hits protected junctions ("Application Data", "Cookies") and fails
   * the build. Naming the root also keeps the standalone output minimal.
   */
  outputFileTracingRoot: join(appDir, '..', '..'),
  /*
   * Prisma ships native query engines that must stay outside the bundle.
   *
   * Note the app builds with Turbopack (`next build --turbopack`). The legacy
   * webpack pipeline crashes on Windows here: one of its plugins globs upward
   * out of the repo and hits protected profile junctions. Turbopack is the
   * default for `next dev` in 15 and stable for builds in 15.5, so this is
   * where the project was heading anyway.
   */
  serverExternalPackages: ['@prisma/client', '@rvagent/db'],
  eslint: {
    // Linting runs once for the whole monorepo from the root, not per build.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // The AudioWorklet is fetched by the browser at runtime and must not be
        // served stale after a deploy that changes the framing logic.
        source: '/worklets/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
