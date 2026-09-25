// Plain ESM (not TypeScript): imported by next.config.ts and by
// scripts/copy-trace-viewer.mjs, which runs under bare Node.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The static Trace Viewer build inside the installed playwright-core. */
export function traceViewerSourceDir() {
  const pkg = createRequire(import.meta.url).resolve('playwright-core/package.json');
  return join(dirname(pkg), 'lib', 'vite', 'traceViewer');
}

/**
 * CSP hashes of the viewer's inline <script> blocks (index.html carries one,
 * a file:// fallback), so its CSP can forbid every other inline script.
 */
export function traceViewerInlineScriptHashes() {
  const dir = traceViewerSourceDir();
  const hashes = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    for (const [, body] of readFileSync(join(dir, file), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }
  }
  return [...hashes];
}
