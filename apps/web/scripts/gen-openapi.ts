/**
 * Writes docs/openapi.json from the REST API router. Run from apps/web:
 * `nub run api:docs`. `lib/api/openapi.test.ts` fails when the committed file
 * is out of date.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../lib/api/openapi';

const target = path.resolve(import.meta.dirname, '../../../docs/openapi.json');
writeFileSync(target, `${JSON.stringify(await openApiDocument(), null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), target)}`);
