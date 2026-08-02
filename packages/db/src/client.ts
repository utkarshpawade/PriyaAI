import { type Prisma, PrismaClient } from '../generated/client/index.js';

/**
 * Single Prisma instance per process.
 *
 * Cached on `globalThis` outside production because Next.js dev and `tsx watch`
 * both re-evaluate modules on every edit, and a fresh PrismaClient per reload
 * exhausts the Postgres connection pool within a few minutes of hacking.
 */
const globalForPrisma = globalThis as unknown as { rvagentPrisma?: PrismaClient };

/**
 * Falls back to the docker-compose database when `DATABASE_URL` is unset, so
 * `pnpm dev` works on a fresh clone with no environment file. Production always
 * supplies the variable, and this default is unreachable from anywhere else.
 */
const DEFAULT_DATABASE_URL = 'postgresql://rvagent:rvagent@localhost:5433/rvagent?schema=public';

// Assigned rather than passed through `datasources`: the schema declares
// `env("DATABASE_URL")`, and Prisma resolves that at client construction before
// any override is applied, so an unset variable fails before it can be replaced.
process.env.DATABASE_URL ??= DEFAULT_DATABASE_URL;

export const prisma: PrismaClient =
  globalForPrisma.rvagentPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.rvagentPrisma = prisma;
}

/**
 * Normalises an arbitrary typed value into something Prisma will accept for a
 * `Json` column. The round trip is not a formality — it is exactly what the
 * driver does anyway, and doing it here keeps `any` out of the call sites.
 */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Reads a `Json` column back as a known shape after zod validation upstream. */
export function fromJson<T>(value: unknown): T {
  return value as T;
}
