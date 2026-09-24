/**
 * A recorded run (`record.ts`) and how it is replayed as another run on
 * another day (`backfill.ts`): every timestamp moves by the same amount, the
 * git and CI metadata become the planned run's, and a sharded run gets its
 * tests dealt out over the shards.
 */
import type { IngestEvent, RunFinish, RunStart } from '@miguelfranken/protocol';
import type { PlannedRun } from '../schedule';

export interface Recording {
  scenario: string;
  start: RunStart;
  events: IngestEvent[];
  finish: RunFinish;
}

export interface ShardReplay {
  start: RunStart;
  events: IngestEvent[];
  /** `shardIndex` comes from the server's answer to `start`. */
  finish: Omit<RunFinish, 'shardIndex'>;
}

export interface ReplayContext {
  ciRunId: string;
  repoUrl?: string;
  buildNumber?: string;
}

/** Which shard a test lands on: stable per test, so a test's history stays on one side. */
function shardOf(testKey: string, shards: number) {
  return Number.parseInt(testKey.slice(0, 8), 16) % shards;
}

export function replay(recording: Recording, run: PlannedRun, at: Date, context: ReplayContext): ShardReplay[] {
  const delta = at.getTime() - Date.parse(recording.start.startedAt);
  const shift = (iso: string) => new Date(Date.parse(iso) + delta).toISOString();
  const shifted = recording.events.map((event): IngestEvent => {
    if (event.type === 'test.begin') return { ...event, startedAt: shift(event.startedAt) };
    if (event.type === 'attempt.end') {
      return { ...event, startedAt: shift(event.startedAt), steps: event.steps.map((s) => ({ ...s, startedAt: shift(s.startedAt) })) };
    }
    return event;
  });

  return Array.from({ length: run.shards }, (_, shard) => {
    const events = shifted
      .filter((e) => (e.type === 'run.log' ? shard === 0 : shardOf(e.testKey, run.shards) === shard))
      .map((e, seq) => ({ ...e, seq }));
    const tests = new Set(events.flatMap((e) => (e.type === 'test.begin' ? [e.testKey] : [])));
    const ends = events.flatMap((e) => (e.type === 'attempt.end' ? [e] : []));
    const lastEnd = Math.max(at.getTime(), ...ends.map((e) => Date.parse(e.startedAt) + e.durationMs));
    // A second or so for the reporter to wrap up, as a real one does.
    const finishedAt = new Date(lastEnd + 800 + shard * 150);
    const failed = ends.some((e) => e.isFinal && e.outcome === 'unexpected');
    return {
      start: {
        ...recording.start,
        ciRunId: context.ciRunId,
        shard: run.shards > 1 ? { current: shard + 1, total: run.shards } : null,
        expectedTests: tests.size,
        startedAt: at.toISOString(),
        executor: 'ci',
        environment: run.environment,
        tags: run.tags,
        git: {
          branch: run.branch,
          sha: run.sha,
          shortSha: run.sha.slice(0, 7),
          message: run.message,
          authorName: run.author,
          repoUrl: context.repoUrl,
        },
        ci: { provider: 'github-actions', buildNumber: context.buildNumber, job: 'e2e' },
        system: { ...recording.start.system, hostname: `runner-${shard + 1}` },
      },
      events,
      finish: {
        status: failed ? 'failed' : recording.finish.status === 'failed' ? 'passed' : recording.finish.status,
        durationMs: finishedAt.getTime() - at.getTime(),
        finishedAt: finishedAt.toISOString(),
      },
    };
  });
}
