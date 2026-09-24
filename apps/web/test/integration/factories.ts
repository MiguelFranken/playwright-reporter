/**
 * Payload builders and one scenario driver. These are plain helpers, not
 * fixtures: they only assemble protocol payloads and call the real ingest
 * service, so a suite stays short without hiding what is exercised.
 */
import { randomUUID } from 'node:crypto';
import type {
  AttachmentRef,
  AttemptEndEvent,
  AttemptStatus,
  EventBatch,
  IngestEvent,
  RunFinish,
  RunStart,
  TestBeginEvent,
} from '@repo/protocol';
import type { TokenProject } from '@/lib/ingest/http';
import { finishRun, getRunForProject, ingestEvents, startRun } from '@/lib/ingest/service';

export function runStart(overrides: Partial<RunStart> = {}): RunStart {
  return {
    ciRunId: `ci-${randomUUID().slice(0, 8)}`,
    shard: null,
    expectedTests: 1,
    startedAt: new Date().toISOString(),
    executor: 'ci',
    environment: 'staging',
    tags: ['smoke'],
    git: {
      branch: 'main',
      sha: '0123456789abcdef0123456789abcdef01234567',
      shortSha: '0123456',
      message: 'Add a thing',
      authorName: 'Dev',
      authorEmail: 'dev@example.test',
      repoUrl: 'https://github.com/acme/app',
    },
    ci: { provider: 'github-actions', buildUrl: 'https://ci.example.test/1', buildNumber: '1', job: 'e2e' },
    system: { os: 'linux', arch: 'x64', node: 'v24.0.0', hostname: 'runner-1' },
    playwright: { version: '1.63.0', workers: 4, projects: [{ name: 'chromium', retries: 1, timeout: 30_000 }] },
    ...overrides,
  };
}

let seq = 0;
export function nextSeq() {
  return seq++;
}

export function testBegin(overrides: Partial<TestBeginEvent> = {}): TestBeginEvent {
  const title = overrides.title ?? 'renders the page';
  const file = overrides.file ?? 'tests/home.spec.ts';
  return {
    seq: overrides.seq ?? nextSeq(),
    type: 'test.begin',
    testKey: overrides.testKey ?? `${file}::${title}`,
    pwTestId: `pw-${title}`,
    title,
    titlePath: [file, title],
    file,
    line: 10,
    column: 3,
    project: 'chromium',
    tags: [],
    annotations: [],
    expectedStatus: 'passed',
    retries: 1,
    retry: 0,
    workerIndex: 0,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function attemptEnd(overrides: Partial<AttemptEndEvent> = {}): AttemptEndEvent {
  return {
    seq: overrides.seq ?? nextSeq(),
    type: 'attempt.end',
    testKey: overrides.testKey ?? 'tests/home.spec.ts::renders the page',
    retry: 0,
    status: 'passed',
    durationMs: 1200,
    startedAt: new Date().toISOString(),
    workerIndex: 0,
    parallelIndex: 0,
    errors: [],
    steps: [],
    stdout: '',
    stderr: '',
    annotations: [],
    attachments: [],
    outcome: 'expected',
    isFinal: true,
    ...overrides,
  };
}

export function attachmentRef(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return { id: randomUUID(), name: 'screenshot', contentType: 'image/png', size: 12, ...overrides };
}

export function eventBatch(events: IngestEvent[], shardIndex = 1): EventBatch {
  return { shardIndex, events };
}

export function runFinish(overrides: Partial<RunFinish> = {}): RunFinish {
  return { shardIndex: 1, status: 'passed', durationMs: 5000, finishedAt: new Date().toISOString(), ...overrides };
}

// ------------------------------------------------------------------ scenarios

export type ScenarioOutcome = 'passed' | 'failed' | 'flaky' | 'skipped' | 'timedout' | 'interrupted' | 'running';

export interface ScenarioTest {
  outcome: ScenarioOutcome;
  file?: string;
  title?: string;
  project?: string;
  tags?: string[];
  durationMs?: number;
  /** Error message for the failing attempt; drives `error_signature`. */
  error?: string;
  attachments?: AttachmentRef[];
}

export interface Scenario {
  ciRunId?: string;
  startedAt?: Date;
  branch?: string;
  environment?: string;
  message?: string;
  shortSha?: string;
  tags?: string[];
  tests: ScenarioTest[];
  /** Leave the run open (no `finishRun`). */
  finish?: boolean;
}

const ATTEMPT: Record<Exclude<ScenarioOutcome, 'running' | 'flaky'>, AttemptStatus> = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  timedout: 'timedOut',
  interrupted: 'interrupted',
};

/**
 * Drives `startRun → ingestEvents → finishRun` for a declarative list of tests,
 * producing exactly the rows a real reporter would.
 */
export async function playRun(project: TokenProject, scenario: Scenario) {
  const startedAt = scenario.startedAt ?? new Date();
  const started = await startRun(
    project,
    runStart({
      ciRunId: scenario.ciRunId ?? `ci-${randomUUID().slice(0, 8)}`,
      expectedTests: scenario.tests.length,
      startedAt: startedAt.toISOString(),
      environment: scenario.environment ?? 'staging',
      tags: scenario.tags ?? [],
      git: {
        branch: scenario.branch ?? 'main',
        sha: (scenario.shortSha ?? 'abc1234').padEnd(40, '0'),
        shortSha: scenario.shortSha ?? 'abc1234',
        message: scenario.message ?? 'Add a thing',
      },
    }),
  );
  const run = await getRunForProject(project, started.runId);

  const events: IngestEvent[] = [];
  let at = startedAt.getTime();
  for (const spec of scenario.tests) {
    const file = spec.file ?? 'tests/home.spec.ts';
    const title = spec.title ?? 'renders the page';
    const pwProject = spec.project ?? 'chromium';
    const testKey = `${file}::${title}::${pwProject}`;
    const duration = spec.durationMs ?? 1000;
    events.push(
      testBegin({
        seq: events.length,
        testKey,
        file,
        title,
        titlePath: [file, title],
        project: pwProject,
        tags: spec.tags ?? [],
        startedAt: new Date(at).toISOString(),
        expectedStatus: spec.outcome === 'skipped' ? 'skipped' : 'passed',
      }),
    );
    if (spec.outcome === 'running') {
      at += duration;
      continue;
    }
    const error = spec.error ?? (spec.outcome === 'failed' || spec.outcome === 'timedout' ? 'Expected true, received false' : undefined);
    if (spec.outcome === 'flaky') {
      events.push(
        attemptEnd({
          seq: events.length,
          testKey,
          retry: 0,
          status: 'failed',
          durationMs: duration,
          startedAt: new Date(at).toISOString(),
          errors: [{ message: spec.error ?? 'Flaked once' }],
          outcome: 'flaky',
          isFinal: false,
        }),
      );
      at += duration;
      events.push(
        attemptEnd({
          seq: events.length,
          testKey,
          retry: 1,
          status: 'passed',
          durationMs: duration,
          startedAt: new Date(at).toISOString(),
          outcome: 'flaky',
          isFinal: true,
          attachments: spec.attachments ?? [],
        }),
      );
    } else {
      events.push(
        attemptEnd({
          seq: events.length,
          testKey,
          retry: 0,
          status: ATTEMPT[spec.outcome],
          durationMs: duration,
          startedAt: new Date(at).toISOString(),
          errors: error ? [{ message: error }] : [],
          outcome: spec.outcome === 'passed' ? 'expected' : spec.outcome === 'skipped' ? 'skipped' : 'unexpected',
          isFinal: true,
          attachments: spec.attachments ?? [],
        }),
      );
    }
    at += duration;
  }

  if (events.length) await ingestEvents(project, run, eventBatch(events, started.shardIndex));

  let finished: Awaited<ReturnType<typeof finishRun>> | undefined;
  if (scenario.finish !== false) {
    const anyFailed = scenario.tests.some((t) => t.outcome === 'failed' || t.outcome === 'timedout');
    finished = await finishRun(
      project,
      run,
      runFinish({
        shardIndex: started.shardIndex,
        status: anyFailed ? 'failed' : 'passed',
        durationMs: at - startedAt.getTime(),
        finishedAt: new Date(at).toISOString(),
      }),
    );
  }
  return { ...started, run, finished };
}
