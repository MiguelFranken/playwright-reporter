import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Annotation, CiInfo, GitInfo, PlaywrightInfo, Step, SystemInfo, TestError } from '@miguelfranken/protocol';
import { users } from './auth';
import { teams } from './tenancy';

export const runStatusEnum = pgEnum('run_status', [
  'running',
  'passed',
  'failed',
  'timedout',
  'interrupted',
  'incomplete',
]);
export const executorEnum = pgEnum('executor', ['ci', 'local']);
export const shardStatusEnum = pgEnum('shard_status', ['running', 'passed', 'failed', 'timedout', 'interrupted', 'incomplete']);
/** Why a run ended: the reporter finished it, or it went silent and was closed as stale. */
export const runEndReasonEnum = pgEnum('run_end_reason', ['reporter', 'stale']);
export const testOutcomeEnum = pgEnum('test_outcome', [
  'running',
  'passed',
  'failed',
  'flaky',
  'skipped',
  'timedout',
  'interrupted',
]);
export const attemptStatusEnum = pgEnum('attempt_status', ['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
export const attachmentKindEnum = pgEnum('attachment_kind', ['screenshot', 'video', 'trace', 'image', 'text', 'other']);
/** `expired`: the bytes were deleted by the retention policy (or the store's own lifecycle); the row stays. */
export const attachmentStatusEnum = pgEnum('attachment_status', ['pending', 'uploaded', 'failed', 'expired']);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    // Unique per team, not globally: two teams may both have a `web` project.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    runCounter: integer('run_counter').notNull().default(0),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('projects_team_slug_idx').on(t.teamId, t.slug)],
);

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    ciRunId: text('ci_run_id').notNull(),
    status: runStatusEnum('status').notNull().default('running'),
    executor: executorEnum('executor').notNull().default('local'),
    environment: text('environment'),
    tags: text('tags').array().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    expectedTests: integer('expected_tests').notNull().default(0),
    shardTotal: integer('shard_total').notNull().default(1),
    gitBranch: text('git_branch'),
    gitSha: text('git_sha'),
    gitShortSha: text('git_short_sha'),
    gitMessage: text('git_message'),
    gitAuthorName: text('git_author_name'),
    gitAuthorEmail: text('git_author_email'),
    gitRepoUrl: text('git_repo_url'),
    prNumber: integer('pr_number'),
    prUrl: text('pr_url'),
    ciProvider: text('ci_provider'),
    ciBuildUrl: text('ci_build_url'),
    ciJob: text('ci_job'),
    ciBuildNumber: text('ci_build_number'),
    git: jsonb('git').$type<GitInfo>().notNull().default({}),
    ci: jsonb('ci').$type<CiInfo>().notNull().default({}),
    system: jsonb('system').$type<SystemInfo>().notNull().default({}),
    playwright: jsonb('playwright').$type<PlaywrightInfo>().notNull().default({ projects: [] }),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
    /** How long the run may stay silent before it counts as stale; fixed when the run starts. */
    staleAfterMs: integer('stale_after_ms').notNull().default(300_000),
    endReason: runEndReasonEnum('end_reason'),
    /** The watchdog workflow run guarding this run, once one is started. */
    watchdogId: text('watchdog_id'),
    /** When an instance claimed the right to start the watchdog (see `lib/runs/watchdog`). */
    watchdogClaimedAt: timestamp('watchdog_claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('runs_project_number_idx').on(t.projectId, t.number),
    uniqueIndex('runs_project_ci_run_idx').on(t.projectId, t.ciRunId),
    index('runs_project_started_idx').on(t.projectId, t.startedAt),
    index('runs_project_branch_idx').on(t.projectId, t.gitBranch),
    index('runs_project_status_idx').on(t.projectId, t.status),
  ],
);

export const runShards = pgTable(
  'run_shards',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    shardIndex: integer('shard_index').notNull(),
    status: shardStatusEnum('status').notNull().default('running'),
    lastSeq: integer('last_seq').notNull().default(-1),
    expectedTests: integer('expected_tests').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    hostname: text('hostname'),
  },
  (t) => [primaryKey({ columns: [t.runId, t.shardIndex] })],
);

export const tests = pgTable(
  'tests',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testKey: text('test_key').notNull(),
    pwTestId: text('pw_test_id'),
    file: text('file').notNull(),
    title: text('title').notNull(),
    titlePath: jsonb('title_path').$type<string[]>().notNull().default([]),
    pwProject: text('pw_project').notNull().default(''),
    tags: text('tags').array().notNull().default([]),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tests_project_key_idx').on(t.projectId, t.testKey), index('tests_project_file_idx').on(t.projectId, t.file)],
);

export const testResults = pgTable(
  'test_results',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    shardIndex: integer('shard_index').notNull().default(0),
    outcome: testOutcomeEnum('outcome').notNull().default('running'),
    expectedStatus: attemptStatusEnum('expected_status').notNull().default('passed'),
    attemptCount: integer('attempt_count').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    line: integer('line').notNull().default(0),
    column: integer('column').notNull().default(0),
    annotations: jsonb('annotations').$type<Annotation[]>().notNull().default([]),
    tags: text('tags').array().notNull().default([]),
    errorSignature: text('error_signature'),
    errorMessage: text('error_message'),
  },
  (t) => [
    uniqueIndex('test_results_run_test_idx').on(t.runId, t.testId),
    index('test_results_test_started_idx').on(t.testId, t.startedAt),
    index('test_results_run_outcome_idx').on(t.runId, t.outcome),
    index('test_results_run_signature_idx').on(t.runId, t.errorSignature),
    index('test_results_project_started_idx').on(t.projectId, t.startedAt),
  ],
);

export const testAttempts = pgTable(
  'test_attempts',
  {
    id: uuid('id').primaryKey(),
    testResultId: uuid('test_result_id')
      .notNull()
      .references(() => testResults.id, { onDelete: 'cascade' }),
    retry: integer('retry').notNull(),
    status: attemptStatusEnum('status').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    workerIndex: integer('worker_index').notNull().default(0),
    parallelIndex: integer('parallel_index').notNull().default(0),
    errors: jsonb('errors').$type<TestError[]>().notNull().default([]),
    steps: jsonb('steps').$type<Step[]>().notNull().default([]),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    annotations: jsonb('annotations').$type<Annotation[]>().notNull().default([]),
  },
  (t) => [uniqueIndex('test_attempts_result_retry_idx').on(t.testResultId, t.retry)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => testAttempts.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    kind: attachmentKindEnum('kind').notNull().default('other'),
    storageKey: text('storage_key').notNull(),
    storageDriver: text('storage_driver').notNull(),
    sizeBytes: integer('size_bytes'),
    status: attachmentStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the stored bytes went away. Set together with `status = 'expired'`. */
    expiredAt: timestamp('expired_at', { withTimezone: true }),
  },
  (t) => [
    index('attachments_attempt_idx').on(t.attemptId),
    index('attachments_run_idx').on(t.runId),
    // The retention sweep's scan: live rows, oldest first.
    index('attachments_live_created_idx').on(t.createdAt).where(sql`expired_at is null`),
  ],
);

export const runEvents = pgTable(
  'run_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('run_events_run_idx').on(t.runId, t.id), index('run_events_project_idx').on(t.projectId, t.id)],
);

// ---------------------------------------------------------------- relations

export const projectsRelations = relations(projects, ({ many, one }) => ({
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  runs: many(runs),
  tokens: many(apiTokens),
  tests: many(tests),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  project: one(projects, { fields: [runs.projectId], references: [projects.id] }),
  shards: many(runShards),
  results: many(testResults),
}));

export const runShardsRelations = relations(runShards, ({ one }) => ({
  run: one(runs, { fields: [runShards.runId], references: [runs.id] }),
}));

export const testsRelations = relations(tests, ({ one, many }) => ({
  project: one(projects, { fields: [tests.projectId], references: [projects.id] }),
  results: many(testResults),
}));

export const testResultsRelations = relations(testResults, ({ one, many }) => ({
  run: one(runs, { fields: [testResults.runId], references: [runs.id] }),
  test: one(tests, { fields: [testResults.testId], references: [tests.id] }),
  attempts: many(testAttempts),
}));

export const testAttemptsRelations = relations(testAttempts, ({ one, many }) => ({
  result: one(testResults, { fields: [testAttempts.testResultId], references: [testResults.id] }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  attempt: one(testAttempts, { fields: [attachments.attemptId], references: [testAttempts.id] }),
}));

export type Project = typeof projects.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunShard = typeof runShards.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type TestResult = typeof testResults.$inferSelect;
export type TestAttempt = typeof testAttempts.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
