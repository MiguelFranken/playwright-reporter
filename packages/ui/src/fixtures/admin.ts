import { NOW, ago } from './now';
import type { DataRetentionPolicyValue } from '../views/admin/data-retention-policy-form';
import type { DataSweepRow, DuePreviewValue, ProjectFootprintRow } from '../views/admin/database';
import type { IngestDayValue, TableSizeValue } from '../views/admin/database-charts';
import type { RetentionSweepRow, StorageUsageRow } from '../views/admin/storage';
import type { RetentionPolicyValue } from '../views/admin/retention-policy-form';

const MB = 1024 ** 2;

export const RETENTION_POLICY: RetentionPolicyValue = { enabled: true, days: 30, overrides: { video: 7, trace: 14 } };

export const STORAGE_USAGE: StorageUsageRow[] = [
  { kind: 'image', liveCount: 12, liveBytes: 3.1 * MB, dueCount: 0, dueBytes: 0, expiredCount: 0, expiredBytes: 0 },
  { kind: 'screenshot', liveCount: 1_842, liveBytes: 412 * MB, dueCount: 96, dueBytes: 21 * MB, expiredCount: 3_210, expiredBytes: 702 * MB },
  { kind: 'text', liveCount: 240, liveBytes: 0.8 * MB, dueCount: 4, dueBytes: 0.01 * MB, expiredCount: 12, expiredBytes: 0.03 * MB },
  { kind: 'trace', liveCount: 388, liveBytes: 2_140 * MB, dueCount: 51, dueBytes: 290 * MB, expiredCount: 910, expiredBytes: 5_020 * MB },
  { kind: 'video', liveCount: 402, liveBytes: 3_480 * MB, dueCount: 120, dueBytes: 1_010 * MB, expiredCount: 1_530, expiredBytes: 13_200 * MB },
];

export const RETENTION_SWEEPS: RetentionSweepRow[] = [
  { id: 58, trigger: 'manual', startedAt: ago(1), finishedAt: null, expiredCount: 0, expiredBytes: 0, hasMore: false, error: null },
  { id: 57, trigger: 'ingest', startedAt: ago(95), finishedAt: ago(94), expiredCount: 312, expiredBytes: 1_420 * MB, hasMore: true, error: null },
  { id: 56, trigger: 'cron', startedAt: ago(60 * 6), finishedAt: ago(60 * 6 - 2), expiredCount: 1_204, expiredBytes: 6_900 * MB, hasMore: false, error: null },
  {
    id: 55,
    trigger: 'cron',
    startedAt: ago(60 * 30),
    finishedAt: ago(60 * 30),
    expiredCount: 0,
    expiredBytes: 0,
    hasMore: false,
    error: 'BlobServiceUnavailable: The Vercel Blob API responded with 503 while deleting a batch of 100 objects',
  },
  { id: 54, trigger: 'force', startedAt: ago(60 * 48), finishedAt: ago(60 * 48 - 3), expiredCount: 5_870, expiredBytes: 21_300 * MB, hasMore: false, error: null },
  { id: 53, trigger: 'cron', startedAt: ago(60 * 54), finishedAt: ago(60 * 54 - 1), expiredCount: 0, expiredBytes: 0, hasMore: false, error: null },
];

// ---------------------------------------------------------------- database


const KB = 1024;
const GB = 1024 ** 3;

export const DATA_RETENTION_POLICY: DataRetentionPolicyValue = {
  enabled: true,
  runDays: 90,
  keepLatestRuns: 20,
  eventDays: 7,
  auditDays: null,
  housekeeping: true,
};

export const DUE_PREVIEW: DuePreviewValue = { runs: 184, results: 43_870, artifactBytes: 2.4 * GB, events: 91_204, audit: null, expired: 37 };

/**
 * A year of ingest, deterministic: weekday traffic with a quiet weekend, a
 * busier last quarter, and a two-week holiday lull.
 */
export function ingestDays(days = 365, until: Date = NOW): IngestDayValue[] {
  const out: IngestDayValue[] = [];
  const today = Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today - i * 86_400_000);
    const weekday = date.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const lull = i > 260 && i < 275;
    const growth = i < 90 ? 1.6 : 1;
    const wobble = 0.75 + ((i * 37) % 11) / 20;
    const runs = lull ? (i % 3 === 0 ? 1 : 0) : Math.round((weekend ? 2 : 14) * growth * wobble);
    const results = runs * 238;
    out.push({
      day: date.toISOString().slice(0, 10),
      runs,
      results,
      attempts: results + Math.round(results * 0.04 * wobble),
      artifactBytes: Math.round(runs * 9.5 * MB * wobble),
    });
  }
  return out;
}

export const TABLE_SIZES: TableSizeValue[] = [
  { name: 'test_attempts', rows: 1_184_220, tableBytes: 2.1 * GB, indexBytes: 0.2 * GB, toastBytes: 1.4 * GB, totalBytes: 3.7 * GB },
  { name: 'test_results', rows: 1_120_870, tableBytes: 0.61 * GB, indexBytes: 0.48 * GB, toastBytes: 12 * MB, totalBytes: 1.1 * GB },
  { name: 'run_events', rows: 2_310_004, tableBytes: 0.52 * GB, indexBytes: 0.19 * GB, toastBytes: 4 * MB, totalBytes: 0.71 * GB },
  { name: 'attachments', rows: 402_118, tableBytes: 140 * MB, indexBytes: 96 * MB, toastBytes: 0, totalBytes: 236 * MB },
  { name: 'runs', rows: 4_702, tableBytes: 22 * MB, indexBytes: 3 * MB, toastBytes: 1 * MB, totalBytes: 26 * MB },
  { name: 'tests', rows: 6_184, tableBytes: 2 * MB, indexBytes: 1.2 * MB, toastBytes: 0, totalBytes: 3.2 * MB },
  { name: 'audit_logs', rows: 3_120, tableBytes: 0.9 * MB, indexBytes: 0.4 * MB, toastBytes: 0, totalBytes: 1.3 * MB },
  { name: 'sessions', rows: 412, tableBytes: 120 * KB, indexBytes: 96 * KB, toastBytes: 8 * KB, totalBytes: 224 * KB },
  { name: 'users', rows: 38, tableBytes: 8 * KB, indexBytes: 48 * KB, toastBytes: 8 * KB, totalBytes: 64 * KB },
  { name: 'data_sweeps', rows: 41, tableBytes: 8 * KB, indexBytes: 16 * KB, toastBytes: 8 * KB, totalBytes: 32 * KB },
];

export const PROJECT_FOOTPRINTS: ProjectFootprintRow[] = [
  {
    projectId: 'p-web',
    projectName: 'web',
    teamName: 'Acme',
    runs: 2_904,
    results: 691_150,
    oldestRunAt: ago(60 * 24 * 410),
    liveArtifactBytes: 5.1 * GB,
    estimatedBytes: 3.4 * GB,
  },
  {
    projectId: 'p-checkout',
    projectName: 'checkout-e2e-against-the-staging-environment-with-feature-flags',
    teamName: 'Payments and billing, platform reliability group',
    runs: 1_620,
    results: 402_100,
    oldestRunAt: ago(60 * 24 * 120),
    liveArtifactBytes: 1.2 * GB,
    estimatedBytes: 1.9 * GB,
  },
  { projectId: 'p-docs', projectName: 'docs', teamName: 'Acme', runs: 178, results: 27_620, oldestRunAt: ago(60 * 24 * 14), liveArtifactBytes: 0, estimatedBytes: 131 * MB },
];

export const DATA_SWEEPS: DataSweepRow[] = [
  { id: 41, trigger: 'manual', startedAt: ago(1), finishedAt: null, deleted: {}, artifactBytes: 0, hasMore: false, error: null },
  {
    id: 40,
    trigger: 'ingest',
    startedAt: ago(95),
    finishedAt: ago(95),
    deleted: { runs: 20, results: 4_760, attempts: 4_950, attachments: 310, events: 5_000, tests: 3, audit: 0, auth: 0, sweepLogs: 0 },
    artifactBytes: 180 * MB,
    hasMore: true,
    error: null,
  },
  {
    id: 39,
    trigger: 'cron',
    startedAt: ago(60 * 6),
    finishedAt: ago(60 * 6 - 3),
    deleted: { runs: 164, results: 39_110, attempts: 40_870, attachments: 2_406, events: 86_204, tests: 18, audit: 0, auth: 37, sweepLogs: 2 },
    artifactBytes: 2.2 * GB,
    hasMore: false,
    error: null,
  },
  {
    id: 38,
    trigger: 'cron',
    startedAt: ago(60 * 30),
    finishedAt: ago(60 * 30),
    deleted: {},
    artifactBytes: 0,
    hasMore: false,
    error: 'BlobServiceUnavailable: The Vercel Blob API responded with 503 while deleting a batch of 100 objects',
  },
  {
    id: 37,
    trigger: 'force',
    startedAt: ago(60 * 48),
    finishedAt: ago(60 * 48 - 4),
    deleted: { runs: 1_204, results: 280_440, attempts: 291_200, attachments: 17_020, events: 610_000, tests: 402 },
    artifactBytes: 14.2 * GB,
    hasMore: false,
    error: null,
  },
];
