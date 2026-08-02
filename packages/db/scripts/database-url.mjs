import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The local development database, matching `docker-compose.yml`.
 *
 * Used only as a last resort so a fresh clone can migrate and seed without
 * first exporting an environment variable — which differs between PowerShell,
 * cmd and bash and is the most common first-run failure.
 */
export const DEFAULT_DATABASE_URL =
  'postgresql://rvagent:rvagent@localhost:5433/rvagent?schema=public';

/**
 * Resolution order: a real environment variable, then the repo-root `.env`
 * (which is where the Neon URL lives), then the docker-compose default.
 */
export function envWithDatabaseUrl(announce = false) {
  loadDotenv({ path: join(repoRoot, '.env'), override: false });

  const env = { ...process.env };
  if (!env.DATABASE_URL) {
    env.DATABASE_URL = DEFAULT_DATABASE_URL;
    if (announce) console.log('DATABASE_URL not set — using the local docker-compose database.');
  } else if (announce) {
    console.log(`Using database at ${new URL(env.DATABASE_URL).host}`);
  }
  return env;
}
