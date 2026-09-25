import { ago } from './now';
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
  { id: 54, trigger: 'cron', startedAt: ago(60 * 54), finishedAt: ago(60 * 54 - 1), expiredCount: 0, expiredBytes: 0, hasMore: false, error: null },
];
