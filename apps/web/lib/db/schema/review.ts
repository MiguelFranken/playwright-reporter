import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { REVIEW_DECISIONS } from '@miguelfranken/ui/lib/review';
import { users } from './auth';
import { attachments, projects, runs, testAttempts, testResults, tests } from './reporting';

export const reviewDecisionEnum = pgEnum('review_decision', REVIEW_DECISIONS);

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
