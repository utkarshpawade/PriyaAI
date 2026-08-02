/**
 * The local development database, matching `docker-compose.yml`.
 *
 * Used as a fallback so a fresh clone can run migrations and seeds without
 * first exporting an environment variable — which differs between PowerShell,
 * cmd and bash and is the most common first-run failure.
 */
export const DEFAULT_DATABASE_URL =
  'postgresql://rvagent:rvagent@localhost:5433/rvagent?schema=public';

/** Returns a process env with DATABASE_URL guaranteed to be present. */
export function envWithDatabaseUrl(announce = false) {
  const env = { ...process.env };
  if (!env.DATABASE_URL) {
    env.DATABASE_URL = DEFAULT_DATABASE_URL;
    if (announce) console.log('DATABASE_URL not set — using the local docker-compose database.');
  }
  return env;
}
