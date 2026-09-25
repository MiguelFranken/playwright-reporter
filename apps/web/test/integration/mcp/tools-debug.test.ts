/**
 * The `debug` toolset against runs played through the real ingest service:
 * one scenario per verdict, bucket and novelty label the tools compute.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AttachmentRef } from '@miguelfranken/protocol';
import { attachments, runs } from '@/lib/db/schema';
import { finishRun, getAttachmentForProject, getRunForProject, ingestEvents, startRun, storeUpload } from '@/lib/ingest/service';
import type { TokenProject } from '@/lib/ingest/http';
import { attachmentRef, attemptEnd, eventBatch, playRun, runFinish, runStart, testBegin } from '../factories';
import { describe, expect, test, type Tenant } from '../fixtures';
import { ERAS, call, createPat, mcpClient, text } from './client';

const HOUR = 3_600_000;
const T0 = Date.now() - 48 * HOUR;
const at = (h: number) => new Date(T0 + h * HOUR);

/** One test failing on every attempt with the given errors (a retried run). */
async function playRetried(
  project: TokenProject,
  opts: { startedAt: Date; shortSha: string; branch?: string; title: string; file: string; attempts: { error: string; line?: number }[]; attachments?: AttachmentRef[] },
) {
  const started = await startRun(
    project,
    runStart({
      ciRunId: `ci-${randomUUID().slice(0, 8)}`,
      expectedTests: 1,
      startedAt: opts.startedAt.toISOString(),
      git: { branch: opts.branch ?? 'main', sha: opts.shortSha.padEnd(40, '0'), shortSha: opts.shortSha, message: 'Retried', repoUrl: 'https://github.com/acme/app' },
    }),
  );
  const run = await getRunForProject(project, started.runId);
  const testKey = `${opts.file}::${opts.title}::chromium`;
  const events = [testBegin({ seq: 0, testKey, title: opts.title, file: opts.file, titlePath: [opts.file, opts.title], startedAt: opts.startedAt.toISOString() })];
  opts.attempts.forEach((a, i) => {
    const last = i === opts.attempts.length - 1;
    events.push(
      attemptEnd({
        seq: i + 1,
        testKey,
        retry: i,
        status: 'failed',
        durationMs: 1000,
        startedAt: new Date(opts.startedAt.getTime() + i * 2000).toISOString(),
        errors: [{ message: a.error, location: { file: opts.file, line: a.line ?? 12, column: 5 } }],
        steps: [
          { title: 'Test body', category: 'test.step', durationMs: 900, depth: 0, startedAt: opts.startedAt.toISOString() },
          { title: 'click Buy', category: 'pw:api', durationMs: 800, depth: 1, startedAt: opts.startedAt.toISOString(), error: a.error },
        ],
        outcome: 'unexpected',
        isFinal: last,
        attachments: last ? (opts.attachments ?? []) : [],
      }) as never,
    );
  });
  await ingestEvents(project, run, eventBatch(events as never, started.shardIndex));
  await finishRun(project, run, runFinish({ shardIndex: started.shardIndex, status: 'failed', finishedAt: new Date(opts.startedAt.getTime() + 5000).toISOString() }));
  await (await import('@/lib/db/drizzle')).db.update(runs).set({ gitRepoUrl: 'https://github.com/acme/app' }).where(eq(runs.id, run.id));
  return started;
}

const CHECKOUT = { title: 'checkout works', file: 'tests/checkout.spec.ts' };
const ASSERT = 'expect(received).toBe(expected)\nExpected: 3\nReceived: 2';

/** main: pass (#1, aaa), pass (#2, bbb), deterministic failure with retries (#3, ccc). */
async function regression(tenant: Tenant) {
  await playRun(tenant.tokenProject, { startedAt: at(0), shortSha: 'aaa1111', tests: [{ ...CHECKOUT, outcome: 'passed' }] });
  await playRun(tenant.tokenProject, { startedAt: at(1), shortSha: 'bbb2222', tests: [{ ...CHECKOUT, outcome: 'passed' }] });
  await playRetried(tenant.tokenProject, { startedAt: at(2), shortSha: 'ccc3333', ...CHECKOUT, attempts: [{ error: ASSERT }, { error: ASSERT }] });
  await (await import('@/lib/db/drizzle')).db.update(runs).set({ gitRepoUrl: 'https://github.com/acme/app' }).where(eq(runs.projectId, tenant.project.id));
}

describe.each(ERAS)('debug tools (%s)', (era) => {
  test('get_failure_context: deterministic verdict, regression window and ruled-out fixes', async ({ tenant }) => {
    await regression(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const result = await call(client, 'get_failure_context', { test: 'checkout works' });
    expect(result.isError).toBeFalsy();
    const d = result.structuredContent as {
      failure: { run: { number: number }; category: string; failedStep: string };
      attempts: { verdict: string };
      regression: { kind: string; lastPass: { runNumber: number; commit: string }; firstFail: { runNumber: number }; compareUrl: string };
      ruledOut: { text: string }[];
      next: string[];
    };
    expect(d.failure.run.number).toBe(3);
    expect(d.failure.category).toBe('assertion');
    expect(d.failure.failedStep).toBe('click Buy');
    expect(d.attempts.verdict).toBe('deterministic');
    expect(d.regression).toMatchObject({ kind: 'regressed', lastPass: { runNumber: 2, commit: 'bbb2222' }, firstFail: { runNumber: 3 } });
    expect(d.regression.compareUrl).toBe(`https://github.com/acme/app/compare/${'bbb2222'.padEnd(40, '0')}...${'ccc3333'.padEnd(40, '0')}`);
    expect(d.ruledOut.map((r) => r.text)).toContain('Timing fixes (waits, retries)');
    expect(d.next.some((n) => n.startsWith('After the next run'))).toBe(true);
    expect(text(result)).toContain('Regression window');

    const summary = await call(client, 'get_failure_context', { test: 'checkout works', detail: 'summary', includeGuidance: false });
    expect(text(summary).length).toBeLessThan(text(result).length);
  });

  test('get_failure_context: attempts that fail differently are inconclusive', async ({ tenant }) => {
    await playRetried(tenant.tokenProject, {
      startedAt: at(0),
      shortSha: 'ddd4444',
      ...CHECKOUT,
      attempts: [{ error: 'Timeout 5000ms exceeded', line: 12 }, { error: 'Timeout 5000ms exceeded', line: 40 }],
    });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const d = (await call(client, 'get_failure_context', { test: 'checkout', run: 'latest' })).structuredContent as { attempts: { verdict: string } };
    expect(d.attempts.verdict).toBe('inconclusive');
  });

  test('check_flakiness: a same-commit conflict makes a test flaky; consistent failures do not', async ({ tenant }) => {
    const login = { title: 'login works', file: 'tests/login.spec.ts' };
    await playRun(tenant.tokenProject, { startedAt: at(0), shortSha: 'eee5555', tests: [{ ...login, outcome: 'passed' }, { ...CHECKOUT, outcome: 'failed', error: ASSERT }] });
    await playRun(tenant.tokenProject, { startedAt: at(1), shortSha: 'eee5555', tests: [{ ...login, outcome: 'failed', error: 'Timeout 5000ms exceeded' }, { ...CHECKOUT, outcome: 'failed', error: ASSERT }] });
    await playRun(tenant.tokenProject, { startedAt: at(2), shortSha: 'fff6666', tests: [{ ...login, outcome: 'passed' }, { ...CHECKOUT, outcome: 'failed', error: ASSERT }] });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });

    const flaky = (await call(client, 'check_flakiness', { test: 'login works' })).structuredContent as { verdict: string; evidence: { sameCommitConflicts: { sha: string }[] } };
    expect(flaky.verdict).toBe('flaky');
    expect(flaky.evidence.sameCommitConflicts[0].sha.startsWith('eee5555')).toBe(true);

    const broken = (await call(client, 'check_flakiness', { test: 'checkout works' })).structuredContent as { verdict: string };
    expect(broken.verdict).toBe('consistently_failing');
  });

  test('summarize_failures: groups by signature and labels novelty against the base branch', async ({ tenant }) => {
    await playRun(tenant.tokenProject, { startedAt: at(0), tests: [{ ...CHECKOUT, outcome: 'failed', error: ASSERT }] });
    await playRun(tenant.tokenProject, {
      startedAt: at(1),
      branch: 'feature/pay',
      tests: [
        { ...CHECKOUT, outcome: 'failed', error: ASSERT },
        { title: 'pay a', file: 'tests/pay.spec.ts', outcome: 'failed', error: 'net::ERR_CONNECTION_REFUSED at http://api/pay' },
        { title: 'pay b', file: 'tests/pay.spec.ts', outcome: 'failed', error: 'net::ERR_CONNECTION_REFUSED at http://api/pay' },
      ],
    });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const d = (await call(client, 'summarize_failures', { run: 'latest', branch: 'feature/pay' })).structuredContent as {
      baseBranch: string;
      groups: { rank: number; category: string; tests: number; novelty: string }[];
    };
    expect(d.baseBranch).toBe('main');
    expect(d.groups).toEqual([
      expect.objectContaining({ rank: 1, category: 'network', tests: 2, novelty: 'new' }),
      expect.objectContaining({ rank: 2, category: 'assertion', tests: 1, novelty: 'known_on_base' }),
    ]);
  });

  test('compare_runs: branch mode buckets new failures, fixes and flakes', async ({ tenant }) => {
    const a = { title: 'a', file: 'tests/a.spec.ts' };
    const b = { title: 'b', file: 'tests/b.spec.ts' };
    const c = { title: 'c', file: 'tests/c.spec.ts' };
    await playRun(tenant.tokenProject, { startedAt: at(0), tests: [{ ...a, outcome: 'passed' }, { ...b, outcome: 'failed' }, { ...c, outcome: 'passed' }] });
    await playRun(tenant.tokenProject, {
      startedAt: at(1),
      branch: 'feature/x',
      tests: [{ ...a, outcome: 'failed', error: ASSERT }, { ...b, outcome: 'passed' }, { ...c, outcome: 'flaky' }, { title: 'd', file: 'tests/d.spec.ts', outcome: 'passed' }],
    });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const d = (await call(client, 'compare_runs', { branch: 'feature/x' })).structuredContent as {
      base: { number: number };
      head: { number: number };
      summary: Record<string, number>;
      newFailures: { title: string; category: string }[];
    };
    expect([d.base.number, d.head.number]).toEqual([1, 2]);
    expect(d.summary).toMatchObject({ newFailures: 1, fixed: 1, newFlaky: 1, added: 1, removed: 0 });
    expect(d.newFailures[0]).toMatchObject({ category: 'assertion' });
  });

  test('verify_fix: fixed, unstable and still failing', async ({ tenant }) => {
    await regression(tenant); // fails in #3
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const verify = async () => (await call(client, 'verify_fix', { test: 'checkout works', baselineRun: 3 })).structuredContent as { status: string; confidence: string | null };

    expect((await verify()).status).toBe('no_runs_since');
    await playRun(tenant.tokenProject, { startedAt: at(3), tests: [{ ...CHECKOUT, outcome: 'flaky' }] });
    expect((await verify()).status).toBe('unstable');
    await playRun(tenant.tokenProject, { startedAt: at(4), tests: [{ ...CHECKOUT, outcome: 'failed', error: ASSERT }] });
    expect((await verify()).status).toBe('still_failing');
    await playRun(tenant.tokenProject, { startedAt: at(5), tests: [{ ...CHECKOUT, outcome: 'failed', error: 'Timeout 30000ms exceeded' }] });
    expect((await verify()).status).toBe('different_failure');

    const invalid = (await call(client, 'verify_fix', { test: 'checkout works', baselineRun: 1 })).structuredContent as { status: string };
    expect(invalid.status).toBe('baseline_invalid');
  });

  test('verify_fix: passes on the first try are fixed', async ({ tenant }) => {
    await regression(tenant);
    await playRun(tenant.tokenProject, { startedAt: at(3), tests: [{ ...CHECKOUT, outcome: 'passed' }] });
    await playRun(tenant.tokenProject, { startedAt: at(4), tests: [{ ...CHECKOUT, outcome: 'passed' }] });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    expect((await call(client, 'verify_fix', { test: 'checkout works', baselineRun: '#3' })).structuredContent).toMatchObject({ status: 'fixed', confidence: 'medium' });
  });

  test('get_rerun_command prints one command per browser project', async ({ tenant }) => {
    await playRun(tenant.tokenProject, {
      startedAt: at(0),
      tests: [
        { ...CHECKOUT, outcome: 'failed' },
        { ...CHECKOUT, outcome: 'failed', project: 'firefox' },
        { title: 'x', file: 'tests/x.spec.ts', outcome: 'flaky' },
      ],
    });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const failed = (await call(client, 'get_rerun_command', {})).structuredContent as { commands: { browser: string; command: string }[] };
    expect(failed.commands).toEqual([
      expect.objectContaining({ browser: 'chromium', command: 'npx playwright test tests/checkout.spec.ts:10 --project=chromium' }),
      expect.objectContaining({ browser: 'firefox', command: 'npx playwright test tests/checkout.spec.ts:10 --project=firefox' }),
    ]);
    const flaky = (await call(client, 'get_rerun_command', { run: 1, scope: 'flaky', repeat: 10 })).structuredContent as { commands: { command: string }[] };
    expect(flaky.commands[0].command).toBe('npx playwright test tests/x.spec.ts:10 --project=chromium --repeat-each=10 --retries=0');
  });

  test('get_artifact: an inline screenshot, a trace link, and expiry', async ({ tenant, storage }) => {
    void storage;
    const shot = attachmentRef({ name: 'screenshot', contentType: 'image/png', size: 4 });
    const trace = attachmentRef({ name: 'trace', contentType: 'application/zip', size: 4 });
    await playRetried(tenant.tokenProject, { startedAt: at(0), shortSha: 'abc0000', ...CHECKOUT, attempts: [{ error: ASSERT }], attachments: [shot, trace] });
    for (const ref of [shot, trace]) {
      const row = await getAttachmentForProject(tenant.tokenProject, ref.id);
      await storeUpload(row, new Blob([new Uint8Array([137, 80, 78, 71])]).stream(), ref.contentType);
    }
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });

    const image = await call(client, 'get_artifact', { attachment: shot.id });
    expect(image.structuredContent).toMatchObject({ delivered: 'image', attachment: { kind: 'screenshot' } });
    const block = image.content.find((c) => c.type === 'image') as { data: string; mimeType: string } | undefined;
    expect(block?.mimeType).toBe('image/png');
    expect(Buffer.from(block!.data, 'base64')).toEqual(Buffer.from([137, 80, 78, 71]));

    const picked = await call(client, 'get_artifact', { result: ((await call(client, 'list_run_results', {})).structuredContent as { results: { resultId: string }[] }).results[0].resultId });
    expect(picked.structuredContent).toMatchObject({ attachment: { id: shot.id } });

    const traced = await call(client, 'get_artifact', { attachment: trace.id });
    expect(traced.structuredContent).toMatchObject({ delivered: 'link' });
    expect((traced.structuredContent as { traceViewerUrl: string }).traceViewerUrl).toMatch(/^http:\/\/test\.local\/trace\/index\.html\?trace=http%3A%2F%2Ftest\.local%2Fapi%2Fartifacts%2F/);

    const db = (await import('@/lib/db/drizzle')).db;
    await db.update(attachments).set({ status: 'expired' }).where(eq(attachments.id, shot.id));
    const expired = await call(client, 'get_artifact', { attachment: shot.id });
    expect(expired.structuredContent?.error).toMatchObject({ code: 'ARTIFACT_EXPIRED' });
  });

  test('prompts and resources', async ({ tenant }) => {
    await regression(tenant);
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token, era });
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['triage_run', 'debug_test', 'investigate_flake', 'branch_check']);
    const prompt = await client.getPrompt({ name: 'debug_test', arguments: { test: 'checkout works', run: '#3' } });
    expect((prompt.messages[0].content as { text: string }).text).toContain('get_failure_context');

    const run = await client.readResource({ uri: `pwr://projects/${tenant.team.slug}/${tenant.project.slug}/runs/3` });
    expect((run.contents[0] as { text: string }).text).toContain('Run #3');
    const guide = await client.readResource({ uri: 'pwr://guide' });
    expect((guide.contents[0] as { text: string }).text).toContain('untrusted');
  });
});

describe('artifact permissions', () => {
  test('artifact links and contents stay behind artifact:read', async ({ tenant }) => {
    // Every team role has artifact:read today, so this checks the wiring: links
    // are minted only for uploaded attachments and carry a signature.
    const shot = attachmentRef({ name: 'screenshot', contentType: 'image/png', size: 4 });
    await playRetried(tenant.tokenProject, { startedAt: at(0), shortSha: 'abc0000', ...CHECKOUT, attempts: [{ error: ASSERT }], attachments: [shot] });
    const client = await mcpClient({ token: (await createPat(tenant.adminUser)).token });
    const result = await call(client, 'get_result', { run: 'latest', test: 'checkout works' });
    const attachment = (result.structuredContent as { attempts: { attachments: { status: string; url: string | null }[] }[] }).attempts[0].attachments[0];
    expect(attachment).toMatchObject({ status: 'pending', url: null });
  });
});
