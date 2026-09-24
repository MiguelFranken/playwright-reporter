#!/usr/bin/env node
/**
 * Runs a command with DATABASE_URL replaced by DATABASE_URL_UNPOOLED.
 *
 * DDL and session state do not survive PgBouncer's transaction pooling, so
 * migrations (and the seed, which runs inside one transaction) need the direct
 * Neon endpoint. The Next app itself always uses the pooled URL.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');

dotenv.config({ path: [join(appRoot, '.env.local'), join(appRoot, '.env')], quiet: true });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('usage: with-unpooled-db.mjs <command> [...args]');
  process.exit(1);
}

const env = { ...process.env };
if (env.DATABASE_URL_UNPOOLED) env.DATABASE_URL = env.DATABASE_URL_UNPOOLED;

const child = spawn(command, args, {
  cwd: appRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
