import { prisma } from '@rvagent/db';
import { logger } from './logger.js';

/**
 * Persistence availability, decided by an actual query at boot rather than by
 * the presence of an environment variable.
 *
 * `@rvagent/db` falls back to the docker-compose URL, so a developer who ran
 * `pnpm db:up` gets persistence with no configuration at all. Someone who did
 * not gets a working voice demo and one clear warning, instead of an error on
 * every single turn.
 */
let enabled = false;
let reason = 'not probed yet';

export function persistenceEnabled(): boolean {
  return enabled;
}

export function persistenceStatus(): string {
  return enabled ? 'postgres' : `disabled (${reason})`;
}

export async function probeDatabase(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    enabled = true;
    reason = 'connected';
    logger.info('database reachable — calls, leads and summaries will be persisted');
  } catch (error) {
    enabled = false;
    reason = error instanceof Error ? firstLine(error.message) : 'connection failed';
    logger.warn(
      `database not reachable (${reason}). The demo will run, but nothing will be saved. ` +
        'Start it with `pnpm db:up && pnpm db:migrate && pnpm db:seed`.',
    );
  }
}

function firstLine(message: string): string {
  const line = message
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  return (line ?? 'connection failed').slice(0, 160);
}
