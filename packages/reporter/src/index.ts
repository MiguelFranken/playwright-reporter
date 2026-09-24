import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError as PwTestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import type { AttachmentRef, AttemptEndEvent, IngestEvent, Step, TestBeginEvent, TestError } from '@miguelfranken/protocol';
import { IngestClient } from './client';
import { collectCiInfo, collectGitInfo, collectPlaywrightInfo, collectSystemInfo, detectExecutor } from './metadata';
import { isListMode, resolveOptions } from './options';
import { EventQueue } from './queue';
import type { ReporterOptions, ResolvedOptions } from './types';

const MAX_TEXT = 64 * 1024;
const MAX_STEPS = 2000;
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_DEBOUNCE_MS = 2000;

interface PendingUpload {
  ref: AttachmentRef;
  source: { path?: string; body?: Buffer };
}

export default class PlaywrightReporterApp implements Reporter {
  private readonly opts: ResolvedOptions | null;
  private client!: IngestClient;
  private queue!: EventQueue;
  private config!: FullConfig;
  private runId: string | undefined;
  private shardIndex = 0;
  private runUrl: string | undefined;
  private startedAt = new Date();
  private startPromise: Promise<void> = Promise.resolve();
  private uploads: PendingUpload[] = [];
  private uploadPromises: Promise<void>[] = [];
  private uploadedBytes = 0;
  private disabled = false;
  private uploadTimer: NodeJS.Timeout | undefined;

  constructor(options: ReporterOptions = {}) {
    this.opts = resolveOptions(options);
    if (!this.opts) {
      this.disabled = true;
      console.warn(
        '[pw-reporter] token or serverUrl missing (PW_REPORTER_TOKEN / PW_REPORTER_URL); reporter disabled.',
      );
    }
  }

  printsToStdio() {
    return false;
  }

  private log(msg: string) {
    if (this.opts?.debug) console.log(`[pw-reporter] ${msg}`);
  }

  private warn(msg: string) {
    console.warn(`[pw-reporter] ${msg}`);
  }

  // ---------------------------------------------------------------- lifecycle

  onBegin(config: FullConfig, suite: Suite) {
    if (this.disabled || !this.opts) return;
    // `playwright test --list` runs the reporters too, but nothing is executed:
    // reporting it would record an empty run.
    if (isListMode()) {
      this.disabled = true;
      return;
    }
    const opts = this.opts;
    this.config = config;
    this.startedAt = new Date();
    this.client = new IngestClient(opts, (m) => this.log(m));
    this.queue = new EventQueue(opts.batchSize, opts.batchIntervalMs, (events) => this.sendBatch(events));

    const env = process.env;
    const body = {
      ciRunId: opts.ciRunId,
      shard: config.shard ? { current: config.shard.current, total: config.shard.total } : null,
      expectedTests: suite.allTests().length,
      startedAt: this.startedAt.toISOString(),
      executor: detectExecutor(env),
      environment: opts.environment,
      tags: opts.tags,
      git: collectGitInfo(config, env),
      ci: collectCiInfo(env),
      system: collectSystemInfo(),
      playwright: collectPlaywrightInfo(config),
    };
    this.startPromise = this.client
      .startRun(body)
      .then((res) => {
        this.runId = res.runId;
        this.shardIndex = res.shardIndex;
        this.runUrl = res.url;
        this.log(`run #${res.runNumber} started (${res.runId})`);
      })
      .catch((err) => {
        this.disabled = true;
        this.warn(`could not start run, reporter disabled: ${(err as Error).message}`);
      });
  }

  onTestBegin(test: TestCase, result: TestResult) {
    if (this.disabled || !this.opts) return;
    const project = test.parent.project();
    const ev: TestBeginEvent = {
      seq: this.queue.nextSeq(),
      type: 'test.begin',
      testKey: this.testKey(test),
      pwTestId: test.id,
      title: test.title,
      titlePath: this.titlePath(test),
      file: this.relFile(test.location.file),
      line: test.location.line,
      column: test.location.column,
      project: project?.name ?? '',
      tags: test.tags,
      annotations: test.annotations.map((a) => ({ type: a.type, description: a.description })),
      expectedStatus: test.expectedStatus,
      retries: test.retries,
      retry: result.retry,
      workerIndex: result.workerIndex,
      startedAt: result.startTime.toISOString(),
    };
    this.queue.push(ev);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.disabled || !this.opts) return;
    const failed = result.status === 'failed' || result.status === 'timedOut';
    const willRetry = failed && result.retry < test.retries;
    const attachments: AttachmentRef[] = [];
    if (this.opts.artifacts) {
      for (const a of result.attachments) {
        if (!a.path && !a.body) continue;
        const ref: AttachmentRef = {
          id: randomUUID(),
          name: a.name,
          contentType: a.contentType,
          size: a.body?.byteLength,
        };
        attachments.push(ref);
        this.uploads.push({ ref, source: { path: a.path, body: a.body } });
      }
    }
    const ev: AttemptEndEvent = {
      seq: this.queue.nextSeq(),
      type: 'attempt.end',
      testKey: this.testKey(test),
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
      startedAt: result.startTime.toISOString(),
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
      errors: result.errors.map(mapError),
      steps: flattenSteps(result.steps),
      stdout: joinChunks(result.stdout),
      stderr: joinChunks(result.stderr),
      annotations: (result.annotations ?? test.annotations).map((a) => ({
        type: a.type,
        description: a.description,
      })),
      attachments,
      outcome: test.outcome(),
      isFinal: !willRetry,
    };
    this.queue.push(ev);
    if (attachments.length) this.scheduleUploads();
  }

  onError(error: PwTestError) {
    if (this.disabled || !this.opts) return;
    this.queue.push({
      seq: this.queue.nextSeq(),
      type: 'run.log',
      level: 'error',
      message: (error.message ?? error.value ?? 'unknown error').slice(0, 4000),
    });
  }

  async onEnd(result: FullResult) {
    if (this.disabled || !this.opts) return;
    await this.startPromise;
    if (!this.runId) return;
    try {
      await this.queue.drain();
      this.scheduleUploads(true);
      await withTimeout(Promise.all(this.uploadPromises), this.opts.uploadTimeoutMs, 'uploads');
      const res = await this.client.finishRun(this.runId, {
        shardIndex: this.shardIndex,
        status: result.status,
        durationMs: result.duration,
        finishedAt: new Date().toISOString(),
      });
      this.runUrl = res.url;
      console.log(
        `\n[pw-reporter] Run report: ${this.runUrl} (${formatBytes(this.uploadedBytes)} of artifacts uploaded)`,
      );
    } catch (err) {
      this.warn(`finishing run failed: ${(err as Error).message}`);
    }
  }

  async onExit() {
    if (this.disabled || !this.runId) return;
    await this.queue.drain().catch(() => undefined);
  }

  // ---------------------------------------------------------------- internals

  private async sendBatch(events: IngestEvent[]) {
    await this.startPromise;
    if (!this.runId) return;
    try {
      await this.client.sendEvents(this.runId, { shardIndex: this.shardIndex, events });
      this.log(`sent ${events.length} events`);
    } catch (err) {
      this.warn(`dropping ${events.length} events: ${(err as Error).message}`);
    }
  }

  /**
   * Uploads start a moment after a test ends, so the attachments of tests that
   * end close together share one upload-urls request. `onEnd` passes `now`.
   */
  private scheduleUploads(now = false) {
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = undefined;
    if (this.uploads.length === 0) return;
    if (!now) {
      this.uploadTimer = setTimeout(() => this.scheduleUploads(true), UPLOAD_DEBOUNCE_MS);
      this.uploadTimer.unref?.();
      return;
    }
    const batch = this.uploads.splice(0, this.uploads.length);
    const p = this.uploadBatch(batch).catch((err) => this.warn(`upload batch failed: ${(err as Error).message}`));
    this.uploadPromises.push(p);
  }

  private async uploadBatch(batch: PendingUpload[]) {
    await this.startPromise;
    // Attachment rows are created server-side by the attempt.end event, so flush events first.
    await this.queue.drain();
    if (!this.runId) return;
    const runId = this.runId;
    const { uploads } = await this.client.uploadUrls(
      runId,
      batch.map((b) => b.ref.id),
    );
    const byId = new Map(uploads.map((u) => [u.attachmentId, u]));
    let i = 0;
    const worker = async () => {
      while (i < batch.length) {
        const item = batch[i++];
        const instr = byId.get(item.ref.id);
        if (!instr) continue;
        try {
          const size = await this.client.upload(instr, item.source, item.ref.contentType);
          this.uploadedBytes += size;
          // A proxied upload is recorded by the server as it arrives; a presigned
          // one went straight to storage, so the server has to be told.
          if (instr.strategy !== 'proxy') await this.client.completeUpload(runId, item.ref.id, size);
        } catch (err) {
          this.warn(`upload of ${item.ref.name} failed: ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  }

  private relFile(file: string) {
    return path.relative(this.config.rootDir, file).split(path.sep).join('/');
  }

  private titlePath(test: TestCase) {
    // Drop root suite, project suite and file suite; keep describe blocks + title.
    const full = test.titlePath().filter(Boolean);
    const project = test.parent.project()?.name;
    const rel = this.relFile(test.location.file);
    return full.filter((t) => t !== project && t !== rel);
  }

  private testKey(test: TestCase) {
    const project = test.parent.project()?.name ?? '';
    const key = [project, this.relFile(test.location.file), ...this.titlePath(test)].join(' ');
    return createHash('sha1').update(key).digest('hex');
  }
}

function mapError(e: PwTestError): TestError {
  return {
    message: e.message?.slice(0, 20_000),
    stack: e.stack?.slice(0, 20_000),
    value: e.value,
    snippet: e.snippet,
    location: e.location
      ? { file: e.location.file, line: e.location.line, column: e.location.column }
      : undefined,
  };
}

function flattenSteps(steps: TestStep[]): Step[] {
  const out: Step[] = [];
  const walk = (list: TestStep[], depth: number) => {
    for (const s of list) {
      if (out.length >= MAX_STEPS) return;
      out.push({
        title: s.title,
        category: s.category,
        durationMs: s.duration,
        depth,
        startedAt: s.startTime.toISOString(),
        error: s.error?.message?.slice(0, 2000),
        location: s.location
          ? { file: s.location.file, line: s.location.line, column: s.location.column }
          : undefined,
      });
      if (s.steps.length) walk(s.steps, depth + 1);
    }
  };
  walk(steps, 0);
  return out;
}

function joinChunks(chunks: (string | Buffer)[]): string {
  const text = chunks.map((c) => (typeof c === 'string' ? c : c.toString('utf8'))).join('');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[truncated]` : text;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => {
      const t = setTimeout(() => {
        console.warn(`[pw-reporter] timed out waiting for ${label}`);
        resolve(undefined);
      }, ms);
      t.unref?.();
    }),
  ]);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
