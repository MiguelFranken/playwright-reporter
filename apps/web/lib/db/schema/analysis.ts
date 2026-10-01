import { relations, sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AnalysisStatus, Rect } from '@miguelfranken/ui/lib/visual-diff';
import { users } from './auth';
import { projects } from './reporting';
import { teams } from './tenancy';
import { reviewCaptures } from './review';

/**
 * One analysis of a visual comparison by a model: which pair and regions it
 * looked at, under which rules, with which model and prompt, what it cost
 * (reserved before the call, actual after) and what it said. A job never
 * changes rules, baselines or approvals; its suggestions wait for a person.
 */
export const visualAnalysisJobs = pgTable(
  'visual_analysis_jobs',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    baseCaptureId: uuid('base_capture_id')
      .notNull()
      .references(() => reviewCaptures.id, { onDelete: 'cascade' }),
    headCaptureId: uuid('head_capture_id')
      .notNull()
      .references(() => reviewCaptures.id, { onDelete: 'cascade' }),
    /** The comparison's revision (rules and settings) the regions came from. */
    revision: text('revision').notNull(),
    regionIds: jsonb('region_ids').$type<string[]>().notNull().default([]),
    /** What the model is asked for: an explanation of the regions, with or without ignore proposals. */
    purpose: text('purpose').$type<'explain' | 'suggest_ignore'>().notNull().default('suggest_ignore'),
    /** The same pair, regions, rules, model and prompt analysed once: a second request answers with the first job. */
    inputFingerprint: text('input_fingerprint').notNull(),
    /** A caller's key against double clicks and request retries. */
    idempotencyKey: text('idempotency_key'),
    status: text('status').$type<AnalysisStatus>().notNull().default('queued'),
    /** `manual`: a person pressed the button; `proactive`: a finished run. */
    trigger: text('trigger').$type<'manual' | 'proactive' | 'mcp'>().notNull().default('manual'),
    model: text('model').notNull(),
    provider: text('provider'),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    priceVersion: text('price_version').notNull(),
    reservedMicroUsd: bigint('reserved_micro_usd', { mode: 'number' }).notNull().default(0),
    actualMicroUsd: bigint('actual_micro_usd', { mode: 'number' }),
    usage: jsonb('usage').$type<{ inputTokens: number | null; outputTokens: number | null; reasoningTokens?: number | null; images: number }>(),
    summary: text('summary'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('visual_analysis_jobs_fingerprint_idx').on(t.projectId, t.inputFingerprint),
    uniqueIndex('visual_analysis_jobs_idempotency_idx').on(t.projectId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index('visual_analysis_jobs_pair_idx').on(t.baseCaptureId, t.headCaptureId, t.createdAt),
    index('visual_analysis_jobs_project_idx').on(t.projectId, t.createdAt),
    index('visual_analysis_jobs_running_idx').on(t.status, t.claimedAt).where(sql`${t.status} in ('queued', 'running')`),
  ],
);

/**
 * What a model said about one region of a comparison, and what a person did
 * with it. The proposed rectangles are checked against the region before
 * they are stored; accepting one writes a rule revision and records it here.
 */
export const visualAnalysisSuggestions = pgTable(
  'visual_analysis_suggestions',
  {
    id: uuid('id').primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => visualAnalysisJobs.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    regionId: text('region_id').notNull(),
    regionLabel: text('region_label').notNull(),
    observation: text('observation').notNull(),
    hypothesis: text('hypothesis').notNull(),
    alternatives: jsonb('alternatives').$type<string[]>().notNull().default([]),
    recommendation: text('recommendation').notNull(),
    uncertainty: text('uncertainty').$type<'low' | 'medium' | 'high'>().notNull(),
    proposedRects: jsonb('proposed_rects').$type<Rect[]>().notNull().default([]),
    effect: jsonb('effect').$type<{ rawChangedPixels: number; suppressedPixels: number; remainingPixels: number }>(),
    decision: text('decision').$type<'open' | 'accepted' | 'rejected'>().notNull().default('open'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** The rule revision an acceptance wrote. */
    ruleRevision: integer('rule_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visual_analysis_suggestions_job_idx').on(t.jobId), index('visual_analysis_suggestions_project_idx').on(t.projectId, t.decision)],
);

/**
 * A team's (project_id null) or a project's AI spend in one calendar month
 * (UTC): what was spent and what is reserved by jobs still running. Locked
 * row by row when a job reserves, so the limit holds under concurrency.
 */
export const aiBudgetPeriods = pgTable(
  'ai_budget_periods',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** `2026-10`. */
    period: text('period').notNull(),
    spentMicroUsd: bigint('spent_micro_usd', { mode: 'number' }).notNull().default(0),
    reservedMicroUsd: bigint('reserved_micro_usd', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_budget_periods_team_idx').on(t.teamId, t.period).where(sql`${t.projectId} is null`),
    uniqueIndex('ai_budget_periods_project_idx').on(t.teamId, t.projectId, t.period).where(sql`${t.projectId} is not null`),
  ],
);

/** Every movement of money: a reservation, its settlement, the release of what was not used. Append only. */
export const aiUsageLedger = pgTable(
  'ai_usage_ledger',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => visualAnalysisJobs.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    kind: text('kind').$type<'reserve' | 'settle' | 'release'>().notNull(),
    microUsd: bigint('micro_usd', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_ledger_job_idx').on(t.jobId, t.kind), index('ai_usage_ledger_period_idx').on(t.teamId, t.period, t.createdAt)],
);

export const visualAnalysisJobsRelations = relations(visualAnalysisJobs, ({ many }) => ({
  suggestions: many(visualAnalysisSuggestions),
}));

export const visualAnalysisSuggestionsRelations = relations(visualAnalysisSuggestions, ({ one }) => ({
  job: one(visualAnalysisJobs, { fields: [visualAnalysisSuggestions.jobId], references: [visualAnalysisJobs.id] }),
}));

export type VisualAnalysisJobRow = typeof visualAnalysisJobs.$inferSelect;
export type VisualAnalysisSuggestionRow = typeof visualAnalysisSuggestions.$inferSelect;
