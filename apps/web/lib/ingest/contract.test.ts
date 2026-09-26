/**
 * The reporter's client is built from the ingest contract, so every endpoint
 * in it must be one of our route handlers, under its path and for its method.
 * Checked from the source: the route modules need a database to load.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INGEST_PREFIX, ingestContract } from '@miguelfranken/protocol/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.join(import.meta.dirname, '../../app');

const endpoints = Object.entries(ingestContract).flatMap(([group, procedures]) =>
  Object.entries(procedures).map(([name, procedure]) => {
    const meta = getOpenAPIMeta(procedure)!;
    return { name: `${group}.${name}`, method: meta.method!, path: `${INGEST_PREFIX}${meta.path}` };
  }),
);

/** `/api/ingest/runs/{runId}/events` → `app/api/ingest/runs/[runId]/events/route.ts`. */
const routeFile = (urlPath: string) => path.join(APP_DIR, urlPath.replace(/\{(\w+)\}/g, '[$1]'), 'route.ts');

describe('ingest contract', () => {
  it.each(endpoints)('$name has a $method route at $path', ({ method, path: urlPath }) => {
    const file = routeFile(urlPath);
    expect(existsSync(file), `${path.relative(APP_DIR, file)} exists`).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(new RegExp(`export (async )?function ${method}\\b|export const ${method}\\b`));
  });
});
