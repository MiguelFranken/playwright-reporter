/**
 * Fills the demo project with the history it would have if the schedule had
 * been running for the last `--days` days: every run `schedule.ts` plans for
 * a slot, replayed from a recording of its scenario (see `record.ts`), oldest
 * first so run numbers follow the calendar.
 *
 *   PW_REPORTER_URL=… PW_REPORTER_TOKEN=… nub scripts/backfill.ts --days 30 [--dry-run]
 *
 * Run it once, before the schedule starts: the replayed runs have fixed ids
 * per slot, so a second pass reopens them rather than duplicating them, but
 * it does not remove what the first one wrote.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunStartResponse } from '@miguelfranken/protocol';
import { createIngestApi } from '@miguelfranken/reporter/client';
import { chance, planSlot, slotJitterMs, slotStart, slotsBetween, type ScenarioName } from '../schedule';
import { replay, type Recording } from './recording';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY_MS = 24 * 60 * 60 * 1000;

function flag(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const days = Number(flag('days') ?? 30);
const dryRun = process.argv.includes('--dry-run');
const serverUrl = process.env.PW_REPORTER_URL?.replace(/\/+$/, '');
const token = process.env.PW_REPORTER_TOKEN;
const repoUrl = process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}` : undefined;
if (!dryRun && (!serverUrl || !token)) {
  console.error('Set PW_REPORTER_URL and PW_REPORTER_TOKEN, or pass --dry-run.');
  process.exit(1);
}

const recordings = new Map<string, Recording[]>();
const dir = path.join(root, 'recordings');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const recording = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Recording;
  recordings.set(recording.scenario, [...(recordings.get(recording.scenario) ?? []), recording]);
}
if (!recordings.has('stable')) {
  console.error(`No recordings of the stable scenario in ${dir}; run scripts/record.ts first.`);
  process.exit(1);
}

function pick(scenario: ScenarioName, slot: number, id: string): Recording {
  const options = recordings.get(scenario) ?? recordings.get('stable')!;
  return options[Math.floor(chance('recording', slot, id) * options.length)];
}

const api = createIngestApi({ serverUrl: serverUrl ?? '', token: token ?? '', maxRetries: 4 }, console.warn);

const now = new Date();
// Oldest first across slots and branches, so run numbers follow the clock.
const planned = slotsBetween(new Date(now.getTime() - days * DAY_MS), now)
  .flatMap((slot) => planSlot(slot).map((run) => ({ slot, run, at: new Date(slotStart(slot).getTime() + slotJitterMs(slot, run.id)) })))
  .filter(({ at }) => at.getTime() < now.getTime() - 5 * 60 * 1000)
  .sort((a, b) => a.at.getTime() - b.at.getTime());

let replayed = 0;
for (const [n, { slot, run, at }] of planned.entries()) {
  const recording = pick(run.scenario, slot, run.id);
  const shards = replay(recording, run, at, { ciRunId: `backfill-${slot}-${run.id}`, repoUrl, buildNumber: String(n + 1) });
  const label = `${at.toISOString().slice(0, 16).replace('T', ' ')}  ${run.branch.padEnd(28)} ${run.scenario.padEnd(20)}`;
  if (dryRun) {
    console.log(`${label} ${shards.map((s) => `${s.events.length} events`).join(' + ')}`);
    continue;
  }
  // One after the other: the first start creates the run the second one joins.
  const started: RunStartResponse[] = [];
  for (const shard of shards) started.push(await api.runs.start(shard.start));
  for (const [i, shard] of shards.entries()) {
    const { runId, shardIndex } = started[i];
    for (let from = 0; from < shard.events.length; from += 500) {
      await api.runs.events({ runId, shardIndex, events: shard.events.slice(from, from + 500) });
    }
  }
  let result = '';
  for (const [i, shard] of shards.entries()) {
    const { runId, shardIndex } = started[i];
    result = (await api.runs.finish({ runId, shardIndex, ...shard.finish })).runStatus;
  }
  replayed++;
  console.log(`${label} → run #${started[0].runNumber} ${result}`);
}
console.log(`\n${dryRun ? `Planned ${planned.length}` : `Replayed ${replayed}`} runs over ${days} days.`);
