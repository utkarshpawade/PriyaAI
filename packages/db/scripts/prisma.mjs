#!/usr/bin/env node
/** Runs the Prisma CLI with a sensible local DATABASE_URL default. */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envWithDatabaseUrl } from './database-url.mjs';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Passed as one shell string: Node deprecates an args array with shell:true,
// and every argument here is a fixed literal token from package.json.
const child = spawn(['prisma', ...process.argv.slice(2)].join(' '), {
  cwd: packageRoot,
  env: envWithDatabaseUrl(true),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
