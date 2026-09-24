/**
 * Renders the design system's whole-screen stories to PNG pairs, light and
 * dark, for the seed to upload as `media`.
 *
 * Storybook is the source rather than the running app because it needs no
 * database, no session and no demo data: the stories already compose the exact
 * screens with deterministic fixtures, so the same command produces the same
 * pixels on any machine and in CI. The results are committed (a handful of
 * files, a couple of megabytes) so `db:seed` works without a build step.
 *
 *   pnpm --filter @miguelfranken/storybook build
 *   pnpm --filter @miguelfranken/website screenshots
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const staticDir = resolve(appRoot, '../storybook/storybook-static');
const outDir = resolve(appRoot, 'payload/seed/screenshots');

/** Story id → the file name the seed looks for. */
const SHOTS: { id: string; name: string }[] = [
  { id: 'pages-dashboard--default', name: 'dashboard' },
  { id: 'pages-runs--default', name: 'runs' },
  { id: 'pages-run--summary', name: 'run-detail' },
  { id: 'pages-explorer--default', name: 'explorer' },
  { id: 'views-run-resultattempts--flaky', name: 'result-attempts' },
  { id: 'views-settings--reporter', name: 'settings-reporter' },
];

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * A three-line static server. `file://` would do for the HTML, but the
 * Storybook bundle fetches its index over HTTP and CORS-blocks itself
 * otherwise.
 */
function serve(root: string) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = join(root, url.pathname === '/' ? '/index.html' : url.pathname);
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise<{ origin: string; close: () => Promise<void> }>((done) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((closed) => server.close(() => closed())),
      });
    });
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });

  try {
    await readFile(join(staticDir, 'index.html'));
  } catch {
    console.error(
      `No Storybook build at ${staticDir}.\nRun: pnpm --filter @miguelfranken/storybook build`,
    );
    process.exit(1);
  }

  const { origin, close } = await serve(staticDir);
  const browser = await chromium.launch();

  try {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();

      for (const shot of SHOTS) {
        const url = `${origin}/iframe.html?id=${shot.id}&globals=theme:${theme}&viewMode=story`;
        await page.goto(url, { waitUntil: 'networkidle' });
        // Web fonts settle after paint; a screenshot taken before they do
        // shows the fallback face and every line is the wrong width.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);

        const file = join(outDir, `${shot.name}.${theme}.png`);
        await page.screenshot({ path: file });
        console.log(`✓ ${shot.name}.${theme}.png`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await close();
  }
}

await main();
