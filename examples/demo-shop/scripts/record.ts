/**
 * Records what the real reporter sends for a run of the suite, once per
 * scenario, so `backfill.ts` can replay those runs on earlier days.
 *
 * A small server stands in for the app and speaks just enough of the ingest
 * protocol for the reporter to go through a whole run; the run's start, its
 * events and its finish are written to `recordings/<scenario>-<n>.json`.
 * Artifacts are left out: a replayed run has its results, steps and errors,
 * the live runs have the files.
 *
 *   nub scripts/record.ts [--runs <scenario>=<n>,…]
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { EventBatch, IngestEvent, RunFinish, RunStart } from '@miguelfranken/protocol';
import { SCENARIOS, type ScenarioName } from '../schedule';
import type { Recording } from './recording';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'recordings');
const PORT = 4999;

/** More recordings where the outcome varies from run to run, so the replays differ too. */
const DEFAULT_RUNS: Partial<Record<ScenarioName, number>> = { stable: 4, 'flaky-search': 2 };

function runsPerScenario(): [ScenarioName, number][] {
  const arg = process.argv.indexOf('--runs');
  const custom: Record<string, string> = arg > 0 ? Object.fromEntries(process.argv[arg + 1].split(',').map((p) => p.split('='))) : {};
  const names = (arg > 0 ? Object.keys(custom) : Object.keys(SCENARIOS)) as ScenarioName[];
  return names.map((name) => [name, Number(custom[name] ?? DEFAULT_RUNS[name] ?? 1)]);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);
  return JSON.parse((req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8')) as T;
}

interface Capture {
  start?: RunStart;
  events: IngestEvent[];
  finish?: RunFinish;
}
let capture: Capture | null = null;

const server = createServer(async (req, res) => {
  const url = req.url ?? '';
  const json = (status: number, value: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
  try {
    if (req.method !== 'POST' || !capture) return json(404, { error: 'not recording' });
    if (url === '/api/ingest/runs') {
      capture.start = await readJson<RunStart>(req);
      return json(200, { runId: randomUUID(), runNumber: 1, shardIndex: 1, url: 'http://recorder.local/runs/1' });
    }
    if (url.endsWith('/events')) {
      const batch = await readJson<EventBatch>(req);
      capture.events.push(...batch.events);
      return json(200, { accepted: batch.events.length, lastSeq: Math.max(-1, ...batch.events.map((e) => e.seq)) });
    }
    if (url.endsWith('/finish')) {
      capture.finish = await readJson<RunFinish>(req);
      return json(200, { runStatus: capture.finish.status, url: 'http://recorder.local/runs/1' });
    }
    if (url.endsWith('/heartbeat')) return json(200, { runStatus: 'running' });
    if (url.endsWith('/upload-urls')) return json(200, { uploads: [] });
    return json(404, { error: `unknown endpoint ${url}` });
  } catch (error) {
    return json(400, { error: (error as Error).message });
  }
});

function runSuite(scenario: ScenarioName): Promise<number | null> {
  // Spawned, not run synchronously: this process has to keep answering the reporter.
  const child = spawn(path.join(root, 'node_modules/.bin/playwright'), ['test', '--reporter=dot,@miguelfranken/reporter'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEMO_SCENARIO: scenario,
      PW_REPORTER_URL: `http://127.0.0.1:${PORT}`,
      PW_REPORTER_TOKEN: 'recording',
      PW_REPORTER_ARTIFACTS: 'false',
      PW_REPORTER_CI_RUN_ID: randomUUID(),
    },
  });
  return new Promise((resolve) => child.on('exit', resolve));
}

await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
mkdirSync(out, { recursive: true });

for (const [scenario, runs] of runsPerScenario()) {
  for (let n = 1; n <= runs; n++) {
    capture = { events: [] };
    console.log(`\n▶ recording ${scenario} #${n}`);
    const exit = await runSuite(scenario);
    const { start, finish, events } = capture;
    if (!start || !finish) {
      console.error(`✗ ${scenario} #${n}: the reporter did not finish a run (exit code ${exit})`);
      process.exitCode = 1;
      continue;
    }
    const recording: Recording = { scenario, start, events, finish };
    const file = path.join(out, `${scenario}-${n}.json`);
    writeFileSync(file, JSON.stringify(recording));
    console.log(`✓ ${path.relative(root, file)}: ${events.length} events, ${finish.status}`);
  }
}
server.close();
