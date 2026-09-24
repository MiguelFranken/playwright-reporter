/**
 * The payloads of the `run_events` rows the live views consume.
 *
 * Each result event carries the result's state *before* and *after* it, so a
 * view that holds nothing but totals (the run header, a runs-table row, a spec
 * file's tally) can move one test from one bucket to the other without asking
 * the server. `prevOutcome: null` means the result did not exist before.
 *
 * Shared by the ingest service that writes them and the client store that
 * applies them — so this module must not import anything server-only.
 */

export interface TestBeginPayload {
  testId: string;
  resultId: string;
  title: string;
  titlePath: string[];
  file: string;
  project: string;
  line: number;
  tags: string[];
  annotations: { type: string; description?: string }[];
  retry: number;
  outcome: string;
  prevOutcome: string | null;
}

export interface AttemptEndPayload {
  testId: string;
  resultId: string;
  title: string;
  file: string;
  project: string;
  retry: number;
  status: string;
  isFinal: boolean;
  /** This attempt's duration. */
  durationMs: number;
  outcome: string;
  prevOutcome: string | null;
  /** The result's totals after this attempt. */
  resultDurationMs: number;
  attemptCount: number;
  errorMessage: string | null;
  errorSignature: string | null;
  prevErrorSignature: string | null;
  annotations: { type: string; description?: string }[];
}

export interface ShardStartedPayload {
  shardIndex: number;
  shardTotal: number;
  expectedTests: number;
}

export interface ShardFinishedPayload {
  shardIndex: number;
  status: string;
}

export interface RunFinishedPayload {
  status: string;
  /** Set when the run went silent and was closed by its watchdog. */
  reason?: 'stale';
  /** Absent on runs closed as stale before the watchdog recorded durations. */
  durationMs?: number;
  finishedAt?: string;
}

/** What the SSE stream adds to every payload. */
export interface StreamMeta {
  runId: string;
  at: string;
}

export type LiveEvent =
  | { id: number; type: 'run.started'; data: { runNumber: number } & StreamMeta }
  | { id: number; type: 'shard.started'; data: ShardStartedPayload & StreamMeta }
  | { id: number; type: 'test.begin'; data: TestBeginPayload & StreamMeta }
  | { id: number; type: 'attempt.end'; data: AttemptEndPayload & StreamMeta }
  | { id: number; type: 'shard.finished'; data: ShardFinishedPayload & StreamMeta }
  | { id: number; type: 'run.finished'; data: RunFinishedPayload & StreamMeta }
  /** A run closed as stale heard from its reporter again and is running once more. */
  | { id: number; type: 'run.resumed'; data: StreamMeta }
  | { id: number; type: 'run.log'; data: { level: string; message: string } & StreamMeta };

export type LiveEventType = LiveEvent['type'];

export const LIVE_EVENT_TYPES: LiveEventType[] = [
  'run.started',
  'shard.started',
  'test.begin',
  'attempt.end',
  'shard.finished',
  'run.finished',
  'run.resumed',
  'run.log',
];
