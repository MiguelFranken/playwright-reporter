/**
 * Output shapes and mappers several tools share, so a run looks the same in
 * every answer. Schemas live at module scope (see `registry.ts`).
 */
import { errorCategory } from '@miguelfranken/ui/lib/error-category';
import { z } from 'zod';
import type { Counts, McpRun } from '@/lib/db/queries/mcp';
import { commitUrl, type ProjectLinks } from '../render/links';
import { dur, link, when } from '../render/markdown';
import { firstLine } from '../render/sanitize';

export const countsSchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  flaky: z.number(),
  skipped: z.number(),
  interrupted: z.number(),
  running: z.number(),
});

export const runSummarySchema = z.object({
  number: z.number(),
  status: z.string(),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  message: z.string().nullable(),
  author: z.string().nullable(),
  environment: z.string().nullable(),
  executor: z.string(),
  tags: z.array(z.string()),
  startedAt: z.string(),
  durationMs: z.number().nullable(),
  counts: countsSchema,
  prNumber: z.number().nullable(),
  prUrl: z.string().nullable(),
  ciBuildUrl: z.string().nullable(),
  commitUrl: z.string().nullable(),
  url: z.string(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export function toRunSummary(run: McpRun, links: ProjectLinks): RunSummary {
  return {
    number: run.number,
    status: run.status,
    branch: run.gitBranch,
    commit: run.gitShortSha ?? run.gitSha?.slice(0, 7) ?? null,
    message: run.gitMessage ? firstLine(run.gitMessage, 120) : null,
    author: run.gitAuthorName,
    environment: run.environment,
    executor: run.executor,
    tags: run.tags,
    startedAt: run.startedAt.toISOString(),
    durationMs: run.durationMs,
    counts: run.counts,
    prNumber: run.prNumber,
    prUrl: run.prUrl,
    ciBuildUrl: run.ciBuildUrl,
    commitUrl: commitUrl(run.gitRepoUrl, run.gitSha),
    url: links.run(run.number),
  };
}

export function countsLine(c: Counts): string {
  const parts = [`${c.passed} passed`, `${c.failed} failed`, `${c.flaky} flaky`, `${c.skipped} skipped`];
  if (c.interrupted) parts.push(`${c.interrupted} interrupted`);
  if (c.running) parts.push(`${c.running} running`);
  return `${c.total} tests: ${parts.join(', ')}`;
}

/** "#128 failed · main @ 0123456 · 3m 2s · staging" */
export function runHeadline(run: RunSummary): string {
  const where = [run.branch, run.commit && `@ ${run.commit}`].filter(Boolean).join(' ');
  return [link(`#${run.number}`, run.url), run.status, where || null, dur(run.durationMs), run.environment, when(run.startedAt)].filter(Boolean).join(' · ');
}

export const CATEGORY_KEYS = ['assertion', 'timeout', 'locator', 'network', 'crash', 'snapshot', 'other'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** The failure shape of an error message (see `@miguelfranken/ui/lib/error-category`); null without an error. */
export function categoryOf(message: string | null | undefined): CategoryKey | null {
  if (!message) return null;
  return errorCategory(message).key;
}

export const OUTCOMES = ['passed', 'failed', 'timedout', 'flaky', 'skipped', 'interrupted', 'running'] as const;
export const PROBLEM_OUTCOMES = ['failed', 'timedout', 'interrupted', 'flaky'] as const;
export const RUN_STATUSES = ['running', 'passed', 'failed', 'timedout', 'interrupted', 'incomplete'] as const;
