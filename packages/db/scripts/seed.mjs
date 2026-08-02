#!/usr/bin/env node
/** Runs the seed with the same DATABASE_URL default as the Prisma wrapper. */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envWithDatabaseUrl } from './database-url.mjs';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn('tsx prisma/seed.ts', {
  cwd: packageRoot,
  env: envWithDatabaseUrl(true),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
