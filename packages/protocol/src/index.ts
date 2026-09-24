import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const PROTOCOL_HEADER = 'x-pw-reporter-protocol';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const attemptStatusSchema = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

export const testOutcomeSchema = z.enum(['skipped', 'expected', 'unexpected', 'flaky']);
export type TestOutcome = z.infer<typeof testOutcomeSchema>;

export const runStatusSchema = z.enum(['passed', 'failed', 'timedout', 'interrupted']);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const executorSchema = z.enum(['ci', 'local']);
export type Executor = z.infer<typeof executorSchema>;

export const shardSchema = z.object({
  current: z.number().int().min(1),
  total: z.number().int().min(1),
});
export type Shard = z.infer<typeof shardSchema>;

export const locationSchema = z.object({
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
});
export type Location = z.infer<typeof locationSchema>;

export const annotationSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});
export type Annotation = z.infer<typeof annotationSchema>;

export const testErrorSchema = z.object({
  message: z.string().optional(),
  stack: z.string().optional(),
  value: z.string().optional(),
  snippet: z.string().optional(),
  location: locationSchema.optional(),
});
export type TestError = z.infer<typeof testErrorSchema>;

export const stepSchema = z.object({
  title: z.string(),
  category: z.string(),
  durationMs: z.number(),
  depth: z.number().int().min(0),
  startedAt: z.string(),
  error: z.string().optional(),
  location: locationSchema.optional(),
});
export type Step = z.infer<typeof stepSchema>;

export const attachmentKindSchema = z.enum(['screenshot', 'video', 'trace', 'image', 'text', 'other']);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

export const attachmentRefSchema = z.object({
  /** Client-generated UUID; becomes the attachment id on the server. */
  id: z.string().uuid(),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative().optional(),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

// ---------------------------------------------------------------------------
// Run start
// ---------------------------------------------------------------------------

export const gitInfoSchema = z.object({
  branch: z.string().optional(),
  sha: z.string().optional(),
  shortSha: z.string().optional(),
  message: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  repoUrl: z.string().optional(),
  prNumber: z.number().int().optional(),
  prUrl: z.string().optional(),
});
export type GitInfo = z.infer<typeof gitInfoSchema>;

export const ciInfoSchema = z.object({
  provider: z.string().optional(),
  buildUrl: z.string().optional(),
  buildNumber: z.string().optional(),
  job: z.string().optional(),
});
export type CiInfo = z.infer<typeof ciInfoSchema>;

export const systemInfoSchema = z.object({
  os: z.string().optional(),
  osRelease: z.string().optional(),
  arch: z.string().optional(),
  cpus: z.number().int().optional(),
  memoryBytes: z.number().optional(),
  node: z.string().optional(),
  hostname: z.string().optional(),
  timezone: z.string().optional(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const playwrightProjectInfoSchema = z.object({
  name: z.string(),
  browserName: z.string().optional(),
  viewport: z.object({ width: z.number(), height: z.number() }).nullable().optional(),
  retries: z.number().int(),
  timeout: z.number(),
  baseURL: z.string().optional(),
  headless: z.boolean().optional(),
});

export const playwrightInfoSchema = z.object({
  version: z.string().optional(),
  workers: z.number().int().optional(),
  configFile: z.string().optional(),
  projects: z.array(playwrightProjectInfoSchema),
});
export type PlaywrightInfo = z.infer<typeof playwrightInfoSchema>;

export const runStartSchema = z.object({
  ciRunId: z.string().min(1).max(200),
  shard: shardSchema.nullable(),
  expectedTests: z.number().int().nonnegative(),
  startedAt: z.string(),
  executor: executorSchema,
  environment: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).max(50),
  git: gitInfoSchema,
  ci: ciInfoSchema,
  system: systemInfoSchema,
  playwright: playwrightInfoSchema,
});
export type RunStart = z.infer<typeof runStartSchema>;

export const runStartResponseSchema = z.object({
  runId: z.string(),
  runNumber: z.number().int(),
  shardIndex: z.number().int(),
  url: z.string(),
});
export type RunStartResponse = z.infer<typeof runStartResponseSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const baseEvent = {
  seq: z.number().int().nonnegative(),
};

export const testBeginEventSchema = z.object({
  ...baseEvent,
  type: z.literal('test.begin'),
  testKey: z.string(),
  pwTestId: z.string(),
  title: z.string(),
  titlePath: z.array(z.string()),
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  project: z.string(),
  tags: z.array(z.string()),
  annotations: z.array(annotationSchema),
  expectedStatus: attemptStatusSchema,
  retries: z.number().int(),
  retry: z.number().int(),
  workerIndex: z.number().int(),
  startedAt: z.string(),
});
export type TestBeginEvent = z.infer<typeof testBeginEventSchema>;

export const attemptEndEventSchema = z.object({
  ...baseEvent,
  type: z.literal('attempt.end'),
  testKey: z.string(),
  retry: z.number().int(),
  status: attemptStatusSchema,
  durationMs: z.number(),
  startedAt: z.string(),
  workerIndex: z.number().int(),
  parallelIndex: z.number().int(),
  errors: z.array(testErrorSchema),
  steps: z.array(stepSchema),
  stdout: z.string(),
  stderr: z.string(),
  annotations: z.array(annotationSchema),
  attachments: z.array(attachmentRefSchema),
  /** Playwright's outcome() for the test after this attempt. */
  outcome: testOutcomeSchema,
  /** True when no further retry will follow. */
  isFinal: z.boolean(),
});
export type AttemptEndEvent = z.infer<typeof attemptEndEventSchema>;

export const runLogEventSchema = z.object({
  ...baseEvent,
  type: z.literal('run.log'),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
});
export type RunLogEvent = z.infer<typeof runLogEventSchema>;

export const ingestEventSchema = z.discriminatedUnion('type', [
  testBeginEventSchema,
  attemptEndEventSchema,
  runLogEventSchema,
]);
export type IngestEvent = z.infer<typeof ingestEventSchema>;

export const eventBatchSchema = z.object({
  shardIndex: z.number().int(),
  events: z.array(ingestEventSchema).max(1000),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

export const eventBatchResponseSchema = z.object({
  accepted: z.number().int(),
  lastSeq: z.number().int(),
});
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;

// ---------------------------------------------------------------------------
// Attachments / uploads
// ---------------------------------------------------------------------------

export const uploadUrlsRequestSchema = z.object({
  attachmentIds: z.array(z.string().uuid()).min(1).max(100),
});
export type UploadUrlsRequest = z.infer<typeof uploadUrlsRequestSchema>;

export const uploadInstructionSchema = z.object({
  attachmentId: z.string(),
  strategy: z.enum(['proxy', 'presigned']),
  method: z.literal('PUT'),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
});
export type UploadInstruction = z.infer<typeof uploadInstructionSchema>;

export const uploadUrlsResponseSchema = z.object({
  uploads: z.array(uploadInstructionSchema),
});
export type UploadUrlsResponse = z.infer<typeof uploadUrlsResponseSchema>;

// ---------------------------------------------------------------------------
// Run finish
// ---------------------------------------------------------------------------

export const runFinishSchema = z.object({
  shardIndex: z.number().int(),
  status: runStatusSchema,
  durationMs: z.number(),
  finishedAt: z.string(),
});
export type RunFinish = z.infer<typeof runFinishSchema>;

export const runFinishResponseSchema = z.object({
  runStatus: z.enum(['running', 'passed', 'failed', 'timedout', 'interrupted', 'incomplete']),
  url: z.string(),
});
export type RunFinishResponse = z.infer<typeof runFinishResponseSchema>;

// ---------------------------------------------------------------------------
// Helpers shared by both sides
// ---------------------------------------------------------------------------

/** Classifies a Playwright attachment by name and content type. */
export function classifyAttachment(name: string, contentType: string): AttachmentKind {
  const n = name.toLowerCase();
  if (n === 'trace' || n.endsWith('.zip') && n.includes('trace')) return 'trace';
  if (n === 'video' || contentType.startsWith('video/')) return 'video';
  if (n === 'screenshot' || n.startsWith('screenshot')) return 'screenshot';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')) return 'text';
  return 'other';
}
