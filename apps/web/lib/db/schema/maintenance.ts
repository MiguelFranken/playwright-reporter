/**
 * Instance-wide settings and the log of the artifact retention sweep.
 */
import { bigserial, bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Settings a superadmin changes at runtime, one row per key. The value's shape
 * belongs to the module that owns the key (e.g. `lib/storage/retention`).
 */
export const instanceSettings = pgTable('instance_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** What started a sweep: the scheduler, a finished run, or a superadmin. */
export const sweepTriggerEnum = pgEnum('sweep_trigger', ['cron', 'ingest', 'manual']);

export const artifactSweeps = pgTable(
  'artifact_sweeps',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trigger: sweepTriggerEnum('trigger').notNull(),
    storageDriver: text('storage_driver').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    expiredCount: integer('expired_count').notNull().default(0),
    expiredBytes: bigint('expired_bytes', { mode: 'number' }).notNull().default(0),
    /** True when the sweep stopped at its time budget with expired artifacts left. */
    hasMore: boolean('has_more').notNull().default(false),
    error: text('error'),
  },
  (t) => [index('artifact_sweeps_started_idx').on(t.startedAt)],
);

export type InstanceSetting = typeof instanceSettings.$inferSelect;
export type ArtifactSweep = typeof artifactSweeps.$inferSelect;
