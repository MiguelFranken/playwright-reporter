#!/usr/bin/env node
// Copies Playwright's Trace Viewer (a static PWA shipped inside playwright-core)
// into public/trace, so the app serves it from its own origin. The viewer then
// fetches traces same-origin with the user's session: no third party, and it
// works where trace.playwright.dev cannot reach (VPNs, air-gapped networks).
//
// Runs before `next dev` and `next build`; public/trace is not committed.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceViewerSourceDir } from '../lib/trace-viewer/source.mjs';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'trace');
rmSync(target, { recursive: true, force: true });
cpSync(traceViewerSourceDir(), target, { recursive: true });
console.log(`Trace Viewer copied to ${target}`);
