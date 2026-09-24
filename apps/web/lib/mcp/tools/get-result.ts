import type { Step, TestError } from '@miguelfranken/protocol';
import { z } from 'zod';
import { getResultDetail, testHistory, type AttemptWithAttachments } from '@/lib/db/queries/runs';
import { notFound } from '../errors';
import { branchParam, browserParam, commonParams, environmentParam, fileParam, resultParam, runParam, testParam } from '../params';
import { defineTool, output } from '../registry';
import { STRIP_LEGEND, dur, link, outcomeStrip } from '../render/markdown';
import { clean, firstLine, shortStack, tail } from '../render/sanitize';
import { resolveResult } from '../resolve';
import { categoryOf } from './shared';

const input = z.object({
  ...commonParams,
  result: resultParam.optional(),
  run: runParam.optional(),
  test: testParam.optional(),
  file: fileParam,
  browser: browserParam,
  branch: branchParam,
  environment: environmentParam,
  steps: z.enum(['failed', 'all', 'none']).optional().describe('Steps per attempt: "failed" (default: the failing step and its parents), "all", or "none".'),
  attempts: z.enum(['all', 'last']).optional().describe('Every attempt (default) or only the last one.'),
  includeLogs: z.boolean().optional().describe('Include the tail of stdout/stderr (default false).'),
  logLines: z.number().int().min(1).max(500).optional().describe('Log lines per stream when includeLogs is set (default 50).'),
});

export const errorSchema = z.object({
  message: z.string(),
  category: z.string().nullable(),
  location: z.string().nullable(),
  snippet: z.string().nullable(),
  stack: z.string().nullable(),
});

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nullable(),
  status: z.string(),
  url: z.string().nullable(),
});

const stepSchema = z.object({ title: z.string(), depth: z.number(), durationMs: z.number(), error: z.string().nullable(), location: z.string().nullable() });

const outputSchema = output({
  project: z.string(),
  test: z.object({
    id: z.string(),
    title: z.string(),
    file: z.string(),
    line: z.number(),
    browser: z.string(),
    tags: z.array(z.string()),
    annotations: z.array(z.object({ type: z.string(), description: z.string().nullable() })),
    url: z.string(),
  }),
  run: z.object({ number: z.number(), branch: z.string().nullable(), commit: z.string().nullable(), environment: z.string().nullable(), url: z.string() }),
  resultId: z.string(),
  outcome: z.string(),
  expectedStatus: z.string(),
  durationMs: z.number(),
  attempts: z.array(
    z.object({
      retry: z.number(),
      status: z.string(),
      durationMs: z.number(),
      workerIndex: z.number(),
      errors: z.array(errorSchema),
      failedStep: stepSchema.nullable(),
      steps: z.array(stepSchema).optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      attachments: z.array(attachmentSchema),
    }),
  ),
  history: z.object({ branch: z.string().nullable(), strip: z.string(), runs: z.array(z.object({ runNumber: z.number(), outcome: z.string(), url: z.string() })) }),
  navigation: z.object({ previousInRun: z.string().nullable(), nextInRun: z.string().nullable() }),
  url: z.string(),
});

const loc = (l?: { file?: string; line?: number; column?: number } | null) => (l?.file ? `${l.file}:${l.line ?? 0}${l.column ? `:${l.column}` : ''}` : null);

export function toErrors(errors: TestError[]) {
  return errors.map((e) => ({
    message: clean(e.message ?? e.value ?? '', 2_000),
    category: categoryOf(e.message ?? e.value),
    location: loc(e.location),
    snippet: e.snippet ? clean(e.snippet, 1_500) : null,
    stack: e.stack ? shortStack(e.stack, 15) : null,
  }));
}

/** The deepest step that carries an error: where the attempt actually broke. */
export function failedStep(steps: Step[]): Step | null {
  let found: Step | null = null;
  for (const step of steps) if (step.error && (!found || step.depth >= found.depth)) found = step;
  return found;
}

/** The failing step plus the chain of parents above it, in order. */
function failedPath(steps: Step[]): Step[] {
  const idx = steps.findLastIndex((s) => s.error);
  if (idx < 0) return [];
  const path: Step[] = [steps[idx]];
  let depth = steps[idx].depth;
  for (let i = idx - 1; i >= 0 && depth > 0; i--) {
    if (steps[i].depth < depth) {
      path.unshift(steps[i]);
      depth = steps[i].depth;
    }
  }
  return path;
}

const toStep = (s: Step) => ({ title: clean(s.title, 300), depth: s.depth, durationMs: s.durationMs, error: s.error ? firstLine(s.error, 300) : null, location: loc(s.location) });

export function toAttachments(list: AttemptWithAttachments['attachments'], canRead: boolean, sign: (id: string) => string) {
  return list.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    status: a.status,
    url: canRead && a.status === 'uploaded' ? sign(a.id) : null,
  }));
}

export const getResult = defineTool({
  name: 'get_result',
  title: 'Get result',
  toolset: 'core',
  description:
    'One test execution in full: every attempt with its errors (message, location, code snippet, stack), the failing step, optional logs, attachments with short-lived links, and recent history. Pass "result", or "test" plus "run".',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project);
    const { resultId, runNumber } = await resolveResult(project, args);
    const detail = await getResultDetail(project.project.id, runNumber, resultId);
    if (!detail) throw notFound(`Result ${resultId} not found in ${project.ref}.`);
    const history = await testHistory(detail.test.id, { branch: detail.run.gitBranch, limit: 11 });
    const canRead = project.can({ artifact: ['read'] });
    const stepsMode = args.steps ?? 'failed';
    const logLines = args.logLines ?? 50;
    const attempts = args.attempts === 'last' ? detail.attempts.slice(-1) : detail.attempts;
    const links = project.links;
    const data: z.infer<typeof outputSchema> = {
      project: project.ref,
      test: {
        id: detail.test.id,
        title: detail.test.titlePath.length ? detail.test.titlePath.join(' › ') : detail.test.title,
        file: detail.test.file,
        line: detail.result.line,
        browser: detail.test.pwProject,
        tags: detail.result.tags,
        annotations: detail.result.annotations.map((a) => ({ type: a.type, description: a.description ? clean(a.description, 300) : null })),
        url: links.test(detail.test.id),
      },
      run: {
        number: detail.run.number,
        branch: detail.run.gitBranch,
        commit: detail.run.gitShortSha,
        environment: detail.run.environment,
        url: links.run(detail.run.number),
      },
      resultId,
      outcome: detail.result.outcome,
      expectedStatus: detail.result.expectedStatus,
      durationMs: detail.result.durationMs,
      attempts: attempts.map((a) => {
        const steps = (a.steps ?? []) as Step[];
        const failing = failedStep(steps);
        return {
          retry: a.retry,
          status: a.status,
          durationMs: a.durationMs,
          workerIndex: a.workerIndex,
          errors: toErrors((a.errors ?? []) as TestError[]),
          failedStep: failing ? toStep(failing) : null,
          ...(stepsMode === 'all' ? { steps: steps.slice(0, 200).map(toStep) } : stepsMode === 'failed' ? { steps: failedPath(steps).map(toStep) } : {}),
          ...(args.includeLogs ? { stdout: tail(a.stdout, logLines), stderr: tail(a.stderr, logLines) } : {}),
          attachments: toAttachments(a.attachments, canRead, ctx.artifactUrl),
        };
      }),
      history: {
        branch: detail.run.gitBranch,
        strip: outcomeStrip(history.filter((h) => h.resultId !== resultId).slice(0, 10).map((h) => h.outcome)),
        runs: history
          .filter((h) => h.resultId !== resultId)
          .slice(0, 10)
          .map((h) => ({ runNumber: h.runNumber, outcome: h.outcome, url: links.result(h.runNumber, h.resultId) })),
      },
      navigation: {
        previousInRun: detail.position.prevId ? links.result(detail.run.number, detail.position.prevId) : null,
        nextInRun: detail.position.nextId ? links.result(detail.run.number, detail.position.nextId) : null,
      },
      url: links.result(detail.run.number, resultId),
    };
    return {
      data,
      render(md, d) {
        md.heading(`${d.test.title}`, 2);
        md.kv([
          ['Outcome', `${d.outcome} after ${d.attempts.length} attempt(s), ${dur(d.durationMs)}${d.expectedStatus !== 'passed' ? ` (expected ${d.expectedStatus})` : ''}`],
          ['Where', `${d.test.file}:${d.test.line} · ${d.test.browser}`],
          ['Run', `${link(`#${d.run.number}`, d.run.url)} · ${[d.run.branch, d.run.commit && `@ ${d.run.commit}`].filter(Boolean).join(' ')}${d.run.environment ? ` · ${d.run.environment}` : ''}`],
          ['Tags', d.test.tags.length ? d.test.tags.join(', ') : null],
          ['Annotations', d.test.annotations.length ? d.test.annotations.map((a) => `${a.type}${a.description ? `: ${a.description}` : ''}`).join('; ') : null],
          ['History on branch', d.history.strip ? `${d.history.strip} (${STRIP_LEGEND.toLowerCase()})` : 'first run on this branch'],
          ['Open in app', link('result', d.url)],
        ]);
        for (const a of d.attempts) {
          md.heading(`Attempt ${a.retry + 1}: ${a.status} in ${dur(a.durationMs)} (worker ${a.workerIndex})`, 3);
          for (const e of a.errors) {
            md.line(`**${e.category ?? 'error'}**${e.location ? ` at \`${e.location}\`` : ''}`);
            md.untrusted('Error', e.message);
            if (e.snippet) md.untrusted('Code', e.snippet);
            if (e.stack && args.steps === 'all') md.untrusted('Stack', e.stack);
          }
          if (a.steps?.length) {
            md.line(stepsMode === 'all' ? 'Steps:' : 'Failing step and its parents:');
            md.list(a.steps.map((s) => `${'  '.repeat(Math.min(s.depth, 6))}${s.title} (${dur(s.durationMs)})${s.error ? ` — ✗ ${s.error}` : ''}${s.location ? ` \`${s.location}\`` : ''}`));
          }
          if (a.stdout) md.untrusted('stdout', a.stdout, 20_000);
          if (a.stderr) md.untrusted('stderr', a.stderr, 20_000);
          if (a.attachments.length) {
            md.list(
              a.attachments.map((x) =>
                x.url ? `${x.kind}: ${link(x.name, x.url)} (id ${x.id})` : `${x.kind}: ${x.name} — ${x.status === 'uploaded' ? 'no permission to read artifacts' : x.status}`,
              ),
            );
          }
        }
        if (d.attempts.some((a) => a.attachments.some((x) => x.url))) {
          md.line('Artifact links expire after a few minutes; call get_artifact with an id to view a screenshot or read a text attachment.');
        }
      },
    };
  },
});

