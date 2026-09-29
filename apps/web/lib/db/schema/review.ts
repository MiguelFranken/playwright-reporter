import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { REVIEW_DECISIONS, type DecisionSource, type DiffRegion, type DiffShift, type DiffState } from '@miguelfranken/ui/lib/review';
import { ANCHOR_KINDS, COMMENT_KINDS, COMMENT_SOURCES, THREAD_STATUSES } from '@miguelfranken/ui/lib/review-threads';
import { users } from './auth';
import { attachments, projects, runs, testAttempts, testResults, tests } from './reporting';

export const reviewDecisionEnum = pgEnum('review_decision', REVIEW_DECISIONS);
export const reviewThreadStatusEnum = pgEnum('review_thread_status', THREAD_STATUSES);
export const reviewAnchorKindEnum = pgEnum('review_anchor_kind', ANCHOR_KINDS);
export const reviewCommentKindEnum = pgEnum('review_comment_kind', COMMENT_KINDS);
export const commentSourceEnum = pgEnum('comment_source', COMMENT_SOURCES);

/**
 * A named human-review milestone of one attempt (`coupon-applied`), in capture
 * order. `(test_id, name)` identifies it across runs; its images are the
 * `review_captures` rows, one per variant.
 */
export const reviewCheckpoints = pgTable(
  'review_checkpoints',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    testResultId: uuid('test_result_id')
      .notNull()
      .references(() => testResults.id, { onDelete: 'cascade' }),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => testAttempts.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),
    sequence: integer('sequence').notNull(),
    kind: text('kind'),
    flow: text('flow'),
    stepPath: jsonb('step_path').$type<string[]>().notNull().default([]),
    url: text('url'),
    pageTitle: text('page_title'),
    tags: text('tags').array().notNull().default([]),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    /** Milliseconds from the attempt's start: where the moment is in the attempt's video. */
    offsetMs: integer('offset_ms'),
    /** `record`: sent by the capture helper; `legacy`: read from `review:<name>:<variant>` names. */
    source: text('source').notNull().default('record'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('review_checkpoints_attempt_name_idx').on(t.attemptId, t.name),
    index('review_checkpoints_run_idx').on(t.runId, t.testResultId, t.sequence),
    index('review_checkpoints_test_name_idx').on(t.testId, t.name),
  ],
);

/**
 * One image of a checkpoint: a variant (`desktop`, `mobile`) and how it was
 * taken. `(test_id, checkpoint_name, variant)` is the image's identity across
 * runs, and `sha256` says whether the pixels are the same as another capture's.
 */
export const reviewCaptures = pgTable(
  'review_captures',
  {
    id: uuid('id').primaryKey(),
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => reviewCheckpoints.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    checkpointName: text('checkpoint_name').notNull(),
    variant: text('variant').notNull(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    thumbnailAttachmentId: uuid('thumbnail_attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
    viewportWidth: integer('viewport_width'),
    viewportHeight: integer('viewport_height'),
    deviceScaleFactor: real('device_scale_factor'),
    isMobile: boolean('is_mobile'),
    fullPage: boolean('full_page'),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('review_captures_attachment_idx').on(t.attachmentId),
    index('review_captures_checkpoint_idx').on(t.checkpointId),
    index('review_captures_identity_idx').on(t.testId, t.checkpointName, t.variant, t.createdAt),
    index('review_captures_run_idx').on(t.runId),
  ],
);

/**
 * A reviewer's verdict about an image. It holds for the exact pixels
 * (`sha256`), so every later capture with the same hash inherits it; a capture
 * without a hash (a legacy one) is decided about alone (`capture_id`). The
 * latest decision per identity and hash wins; older ones are the history.
 */
export const reviewDecisions = pgTable(
  'review_decisions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    checkpointName: text('checkpoint_name').notNull(),
    variant: text('variant').notNull(),
    sha256: text('sha256'),
    /** The capture the decision was made on: the baseline image once approved. */
    captureId: uuid('capture_id').references(() => reviewCaptures.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    decision: reviewDecisionEnum('decision').notNull(),
    /**
     * `human`: a reviewer (or an agent with their token). `tolerance`: the
     * project's diff tolerance approved a change too small to matter. Only a
     * human approval becomes a baseline, so noise cannot creep in approval by
     * approval.
     */
    source: text('source').$type<DecisionSource>().notNull().default('human'),
    comment: text('comment'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('review_decisions_identity_idx').on(t.testId, t.checkpointName, t.variant, t.createdAt),
    index('review_decisions_project_idx').on(t.projectId, t.createdAt),
    index('review_decisions_capture_idx').on(t.captureId),
  ],
);

/**
 * The pixel comparison of two images, by content: `head_sha256` measured
 * against `base_sha256`, under `options_key` (the algorithm, its threshold
 * and the ignored areas). Keyed by hashes rather than captures, so the same
 * pair is measured once however many runs capture it; captures find their
 * diff by their own hash and their reference's.
 *
 * Rows start `pending` (planned), are claimed by one worker (`claimed_at`)
 * and end `done`, `failed` or `too_large`.
 */
export const imageDiffs = pgTable(
  'image_diffs',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    baseSha256: text('base_sha256').notNull(),
    headSha256: text('head_sha256').notNull(),
    optionsKey: text('options_key').notNull(),
    /** What `options_key` stands for, so a worker can measure with it. */
    options: jsonb('options').$type<{ threshold: number; ignore: Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>[] }>().notNull(),
    /** The images read: any attachment with the hash would do, these are the ones planned with. */
    baseAttachmentId: uuid('base_attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
    headAttachmentId: uuid('head_attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
    status: text('status').$type<DiffState>().notNull().default('pending'),
    changedPixels: integer('changed_pixels'),
    totalPixels: integer('total_pixels'),
    ratio: real('ratio'),
    baseWidth: integer('base_width'),
    baseHeight: integer('base_height'),
    headWidth: integer('head_width'),
    headHeight: integer('head_height'),
    regions: jsonb('regions').$type<DiffRegion[]>(),
    regionsTruncated: boolean('regions_truncated').notNull().default(false),
    shift: jsonb('shift').$type<DiffShift>(),
    /** The overlay PNG in the attachment store; null without changes. */
    overlayKey: text('overlay_key'),
    overlaySize: integer('overlay_size'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    durationMs: integer('duration_ms'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('image_diffs_pair_idx').on(t.projectId, t.baseSha256, t.headSha256, t.optionsKey),
    index('image_diffs_pending_idx').on(t.status, t.createdAt).where(sql`${t.status} = 'pending'`),
    index('image_diffs_head_attachment_idx').on(t.headAttachmentId),
    index('image_diffs_base_attachment_idx').on(t.baseAttachmentId),
  ],
);

/**
 * Areas of a checkpoint's image left out of its comparisons — a clock, a
 * rotating ad — in the image's pixels, per checkpoint and variant.
 */
export const reviewIgnoreRegions = pgTable(
  'review_ignore_regions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    checkpointName: text('checkpoint_name').notNull(),
    variant: text('variant').notNull(),
    regions: jsonb('regions').$type<Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>[]>().notNull().default([]),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('review_ignore_regions_identity_idx').on(t.testId, t.checkpointName, t.variant)],
);

/**
 * A comment thread on a review image: a numbered pin on a spot or an area of
 * a screenshot (or on the whole image), and the conversation under it. It
 * belongs to the image's identity — `(test_id, checkpoint_name, variant)` —
 * so an open thread follows the image into later runs; `origin_*` is the
 * capture it was placed on, and the anchor is in that image's pixels.
 * `number` counts per identity: the number on the pin.
 */
export const reviewThreads = pgTable(
  'review_threads',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    checkpointName: text('checkpoint_name').notNull(),
    variant: text('variant').notNull(),
    number: integer('number').notNull(),
    originCaptureId: uuid('origin_capture_id').references(() => reviewCaptures.id, { onDelete: 'set null' }),
    originRunId: uuid('origin_run_id').references(() => runs.id, { onDelete: 'set null' }),
    originSha256: text('origin_sha256'),
    /** The origin image's size, kept so the anchor survives the capture's deletion. */
    originWidth: integer('origin_width').notNull(),
    originHeight: integer('origin_height').notNull(),
    originScale: real('origin_scale'),
    anchor: reviewAnchorKindEnum('anchor').notNull(),
    x: real('x').notNull().default(0),
    y: real('y').notNull().default(0),
    w: real('w'),
    h: real('h'),
    status: reviewThreadStatusEnum('status').notNull().default('open'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    /** The capture the thread was resolved on: where a resolved thread is still shown. */
    resolvedCaptureId: uuid('resolved_capture_id').references(() => reviewCaptures.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('review_threads_number_idx').on(t.testId, t.checkpointName, t.variant, t.number),
    index('review_threads_identity_idx').on(t.testId, t.checkpointName, t.variant, t.status),
    index('review_threads_project_idx').on(t.projectId, t.status, t.lastActivityAt),
    index('review_threads_origin_capture_idx').on(t.originCaptureId),
    index('review_threads_resolved_capture_idx').on(t.resolvedCaptureId),
    check('review_threads_area_check', sql`${t.anchor} <> 'area' or (${t.w} is not null and ${t.h} is not null)`),
  ],
);

/**
 * A comment in a thread, or an event in its history (`resolved`, `reopened`).
 * A deleted comment keeps its row (`deleted_at`) so the thread still reads.
 */
export const reviewComments = pgTable(
  'review_comments',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => reviewThreads.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: reviewCommentKindEnum('kind').notNull().default('comment'),
    body: text('body').notNull().default(''),
    source: commentSourceEnum('source').notNull().default('app'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('review_comments_thread_idx').on(t.threadId, t.createdAt)],
);

/**
 * A branch or pull request kept in the library: the visual documentation of
 * the product as that line of work shows it. It follows its newest run, or is
 * pinned to one run (`pinned_run_id`). One reference per project is the
 * default the library opens on; without one it opens on the default branch.
 */
export const libraryReferences = pgTable(
  'library_references',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** `branch` or `pull_request`. */
    kind: text('kind').$type<'branch' | 'pull_request'>().notNull(),
    branch: text('branch'),
    prNumber: integer('pr_number'),
    /** Shown instead of the branch or request, for readers who do not know either: "Checkout redesign". */
    title: text('title'),
    description: text('description'),
    /** The run shown; `null` follows the newest. A deleted run falls back to following. */
    pinnedRunId: uuid('pinned_run_id').references(() => runs.id, { onDelete: 'set null' }),
    isDefault: boolean('is_default').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('library_references_branch_idx').on(t.projectId, t.branch).where(sql`${t.kind} = 'branch'`),
    uniqueIndex('library_references_pr_idx').on(t.projectId, t.prNumber).where(sql`${t.kind} = 'pull_request'`),
    uniqueIndex('library_references_default_idx').on(t.projectId).where(sql`${t.isDefault}`),
    index('library_references_pinned_idx').on(t.pinnedRunId),
    check('library_references_target_check', sql`(${t.kind} = 'branch' and ${t.branch} is not null and ${t.prNumber} is null) or (${t.kind} = 'pull_request' and ${t.prNumber} is not null)`),
  ],
);

export const reviewCheckpointsRelations = relations(reviewCheckpoints, ({ many, one }) => ({
  run: one(runs, { fields: [reviewCheckpoints.runId], references: [runs.id] }),
  captures: many(reviewCaptures),
}));

export const reviewCapturesRelations = relations(reviewCaptures, ({ one }) => ({
  checkpoint: one(reviewCheckpoints, { fields: [reviewCaptures.checkpointId], references: [reviewCheckpoints.id] }),
}));

export type ReviewCheckpointRow = typeof reviewCheckpoints.$inferSelect;
export type ReviewCaptureRow = typeof reviewCaptures.$inferSelect;
export type ReviewDecisionRow = typeof reviewDecisions.$inferSelect;
export type ReviewThreadRow = typeof reviewThreads.$inferSelect;
export type ReviewCommentRow = typeof reviewComments.$inferSelect;
export type LibraryReferenceRow = typeof libraryReferences.$inferSelect;
export type ImageDiffRow = typeof imageDiffs.$inferSelect;
