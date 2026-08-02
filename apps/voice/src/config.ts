import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Repo root first so one .env at the top level configures every app, then the
// app's own file, which wins for anything it overrides.
loadDotenv({ path: ['../../.env', '.env'], override: false });

/**
 * Server configuration.
 *
 * Nothing here is required. A missing database disables persistence rather than
 * crashing, and every provider key is optional by design — the whole point is
 * that `pnpm dev` with an empty environment still gives a working demo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url().optional(),

  /** Comma-separated origins allowed to open the browser WebSocket. */
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  /** Public https origin of this server, used to build the Twilio stream URL. */
  PUBLIC_BASE_URL: z.string().url().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  /** Set false only when tunnelling locally, where signatures never validate. */
  TWILIO_VALIDATE_SIGNATURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  /** Shared secret for the /internal/* endpoints the web app calls. */
  INTERNAL_API_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: ServerEnv = parsed.data;

export const persistenceEnabled = Boolean(env.DATABASE_URL);

export const twilioEnabled = Boolean(
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER,
);

export function allowedOrigins(): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
