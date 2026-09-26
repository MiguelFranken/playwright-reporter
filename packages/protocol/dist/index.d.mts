import { z } from "zod";
//#region src/index.d.ts
export declare const PROTOCOL_VERSION = 1;
export declare const PROTOCOL_HEADER = "x-pw-reporter-protocol";
export declare const attemptStatusSchema: z.ZodEnum<{
  failed: "failed";
  interrupted: "interrupted";
  passed: "passed";
  skipped: "skipped";
  timedOut: "timedOut";
}>;
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
export declare const testOutcomeSchema: z.ZodEnum<{
  expected: "expected";
  flaky: "flaky";
  skipped: "skipped";
  unexpected: "unexpected";
}>;
export type TestOutcome = z.infer<typeof testOutcomeSchema>;
export declare const runStatusSchema: z.ZodEnum<{
  failed: "failed";
  interrupted: "interrupted";
  passed: "passed";
  timedout: "timedout";
}>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export declare const executorSchema: z.ZodEnum<{
  ci: "ci";
  local: "local";
}>;
export type Executor = z.infer<typeof executorSchema>;
export declare const shardSchema: z.ZodObject<{
  current: z.ZodNumber;
  total: z.ZodNumber;
}, z.core.$strip>;
export type Shard = z.infer<typeof shardSchema>;
export declare const locationSchema: z.ZodObject<{
  file: z.ZodString;
  line: z.ZodNumber;
  column: z.ZodNumber;
}, z.core.$strip>;
export type Location = z.infer<typeof locationSchema>;
export declare const annotationSchema: z.ZodObject<{
  type: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Annotation = z.infer<typeof annotationSchema>;
export declare const testErrorSchema: z.ZodObject<{
  message: z.ZodOptional<z.ZodString>;
  stack: z.ZodOptional<z.ZodString>;
  value: z.ZodOptional<z.ZodString>;
  snippet: z.ZodOptional<z.ZodString>;
  location: z.ZodOptional<z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>;
export type TestError = z.infer<typeof testErrorSchema>;
export declare const stepSchema: z.ZodObject<{
  title: z.ZodString;
  category: z.ZodString;
  durationMs: z.ZodNumber;
  depth: z.ZodNumber;
  startedAt: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
  location: z.ZodOptional<z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>;
export type Step = z.infer<typeof stepSchema>;
export declare const attachmentKindSchema: z.ZodEnum<{
  image: "image";
  other: "other";
  screenshot: "screenshot";
  text: "text";
  trace: "trace";
  video: "video";
}>;
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export declare const attachmentRefSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  contentType: z.ZodString;
  size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
export declare const gitInfoSchema: z.ZodObject<{
  branch: z.ZodOptional<z.ZodString>;
  sha: z.ZodOptional<z.ZodString>;
  shortSha: z.ZodOptional<z.ZodString>;
  message: z.ZodOptional<z.ZodString>;
  authorName: z.ZodOptional<z.ZodString>;
  authorEmail: z.ZodOptional<z.ZodString>;
  repoUrl: z.ZodOptional<z.ZodString>;
  prNumber: z.ZodOptional<z.ZodNumber>;
  prUrl: z.ZodOptional<z.ZodString>;
  prTitle: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GitInfo = z.infer<typeof gitInfoSchema>;
export declare const ciInfoSchema: z.ZodObject<{
  provider: z.ZodOptional<z.ZodString>;
  buildUrl: z.ZodOptional<z.ZodString>;
  buildNumber: z.ZodOptional<z.ZodString>;
  job: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CiInfo = z.infer<typeof ciInfoSchema>;
export declare const systemInfoSchema: z.ZodObject<{
  os: z.ZodOptional<z.ZodString>;
  osRelease: z.ZodOptional<z.ZodString>;
  arch: z.ZodOptional<z.ZodString>;
  cpus: z.ZodOptional<z.ZodNumber>;
  memoryBytes: z.ZodOptional<z.ZodNumber>;
  node: z.ZodOptional<z.ZodString>;
  hostname: z.ZodOptional<z.ZodString>;
  timezone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SystemInfo = z.infer<typeof systemInfoSchema>;
export declare const playwrightProjectInfoSchema: z.ZodObject<{
  name: z.ZodString;
  browserName: z.ZodOptional<z.ZodString>;
  viewport: z.ZodOptional<z.ZodNullable<z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
  }, z.core.$strip>>>;
  retries: z.ZodNumber;
  timeout: z.ZodNumber;
  baseURL: z.ZodOptional<z.ZodString>;
  headless: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const playwrightInfoSchema: z.ZodObject<{
  version: z.ZodOptional<z.ZodString>;
  workers: z.ZodOptional<z.ZodNumber>;
  configFile: z.ZodOptional<z.ZodString>;
  projects: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    browserName: z.ZodOptional<z.ZodString>;
    viewport: z.ZodOptional<z.ZodNullable<z.ZodObject<{
      width: z.ZodNumber;
      height: z.ZodNumber;
    }, z.core.$strip>>>;
    retries: z.ZodNumber;
    timeout: z.ZodNumber;
    baseURL: z.ZodOptional<z.ZodString>;
    headless: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
}, z.core.$strip>;
export type PlaywrightInfo = z.infer<typeof playwrightInfoSchema>;
export declare const runStartSchema: z.ZodObject<{
  ciRunId: z.ZodString;
  shard: z.ZodNullable<z.ZodObject<{
    current: z.ZodNumber;
    total: z.ZodNumber;
  }, z.core.$strip>>;
  expectedTests: z.ZodNumber;
  startedAt: z.ZodString;
  executor: z.ZodEnum<{
    ci: "ci";
    local: "local";
  }>;
  environment: z.ZodOptional<z.ZodString>;
  tags: z.ZodArray<z.ZodString>;
  git: z.ZodObject<{
    branch: z.ZodOptional<z.ZodString>;
    sha: z.ZodOptional<z.ZodString>;
    shortSha: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    authorName: z.ZodOptional<z.ZodString>;
    authorEmail: z.ZodOptional<z.ZodString>;
    repoUrl: z.ZodOptional<z.ZodString>;
    prNumber: z.ZodOptional<z.ZodNumber>;
    prUrl: z.ZodOptional<z.ZodString>;
    prTitle: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>;
  ci: z.ZodObject<{
    provider: z.ZodOptional<z.ZodString>;
    buildUrl: z.ZodOptional<z.ZodString>;
    buildNumber: z.ZodOptional<z.ZodString>;
    job: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>;
  system: z.ZodObject<{
    os: z.ZodOptional<z.ZodString>;
    osRelease: z.ZodOptional<z.ZodString>;
    arch: z.ZodOptional<z.ZodString>;
    cpus: z.ZodOptional<z.ZodNumber>;
    memoryBytes: z.ZodOptional<z.ZodNumber>;
    node: z.ZodOptional<z.ZodString>;
    hostname: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>;
  playwright: z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    workers: z.ZodOptional<z.ZodNumber>;
    configFile: z.ZodOptional<z.ZodString>;
    projects: z.ZodArray<z.ZodObject<{
      name: z.ZodString;
      browserName: z.ZodOptional<z.ZodString>;
      viewport: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
      }, z.core.$strip>>>;
      retries: z.ZodNumber;
      timeout: z.ZodNumber;
      baseURL: z.ZodOptional<z.ZodString>;
      headless: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>;
}, z.core.$strip>;
export type RunStart = z.infer<typeof runStartSchema>;
export declare const runStartResponseSchema: z.ZodObject<{
  runId: z.ZodString;
  runNumber: z.ZodNumber;
  shardIndex: z.ZodNumber;
  url: z.ZodString;
}, z.core.$strip>;
export type RunStartResponse = z.infer<typeof runStartResponseSchema>;
export declare const testBeginEventSchema: z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"test.begin">;
  testKey: z.ZodString;
  pwTestId: z.ZodString;
  title: z.ZodString;
  titlePath: z.ZodArray<z.ZodString>;
  file: z.ZodString;
  line: z.ZodNumber;
  column: z.ZodNumber;
  project: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  annotations: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  expectedStatus: z.ZodEnum<{
    failed: "failed";
    interrupted: "interrupted";
    passed: "passed";
    skipped: "skipped";
    timedOut: "timedOut";
  }>;
  retries: z.ZodNumber;
  retry: z.ZodNumber;
  workerIndex: z.ZodNumber;
  startedAt: z.ZodString;
}, z.core.$strip>;
export type TestBeginEvent = z.infer<typeof testBeginEventSchema>;
export declare const attemptEndEventSchema: z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"attempt.end">;
  testKey: z.ZodString;
  retry: z.ZodNumber;
  status: z.ZodEnum<{
    failed: "failed";
    interrupted: "interrupted";
    passed: "passed";
    skipped: "skipped";
    timedOut: "timedOut";
  }>;
  durationMs: z.ZodNumber;
  startedAt: z.ZodString;
  workerIndex: z.ZodNumber;
  parallelIndex: z.ZodNumber;
  errors: z.ZodArray<z.ZodObject<{
    message: z.ZodOptional<z.ZodString>;
    stack: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodString>;
    snippet: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
      file: z.ZodString;
      line: z.ZodNumber;
      column: z.ZodNumber;
    }, z.core.$strip>>;
  }, z.core.$strip>>;
  steps: z.ZodArray<z.ZodObject<{
    title: z.ZodString;
    category: z.ZodString;
    durationMs: z.ZodNumber;
    depth: z.ZodNumber;
    startedAt: z.ZodString;
    error: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
      file: z.ZodString;
      line: z.ZodNumber;
      column: z.ZodNumber;
    }, z.core.$strip>>;
  }, z.core.$strip>>;
  stdout: z.ZodString;
  stderr: z.ZodString;
  annotations: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  attachments: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    contentType: z.ZodString;
    size: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  outcome: z.ZodEnum<{
    expected: "expected";
    flaky: "flaky";
    skipped: "skipped";
    unexpected: "unexpected";
  }>;
  isFinal: z.ZodBoolean;
}, z.core.$strip>;
export type AttemptEndEvent = z.infer<typeof attemptEndEventSchema>;
export declare const runLogEventSchema: z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"run.log">;
  level: z.ZodEnum<{
    error: "error";
    info: "info";
    warn: "warn";
  }>;
  message: z.ZodString;
}, z.core.$strip>;
export type RunLogEvent = z.infer<typeof runLogEventSchema>;
export declare const ingestEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"test.begin">;
  testKey: z.ZodString;
  pwTestId: z.ZodString;
  title: z.ZodString;
  titlePath: z.ZodArray<z.ZodString>;
  file: z.ZodString;
  line: z.ZodNumber;
  column: z.ZodNumber;
  project: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  annotations: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  expectedStatus: z.ZodEnum<{
    failed: "failed";
    interrupted: "interrupted";
    passed: "passed";
    skipped: "skipped";
    timedOut: "timedOut";
  }>;
  retries: z.ZodNumber;
  retry: z.ZodNumber;
  workerIndex: z.ZodNumber;
  startedAt: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"attempt.end">;
  testKey: z.ZodString;
  retry: z.ZodNumber;
  status: z.ZodEnum<{
    failed: "failed";
    interrupted: "interrupted";
    passed: "passed";
    skipped: "skipped";
    timedOut: "timedOut";
  }>;
  durationMs: z.ZodNumber;
  startedAt: z.ZodString;
  workerIndex: z.ZodNumber;
  parallelIndex: z.ZodNumber;
  errors: z.ZodArray<z.ZodObject<{
    message: z.ZodOptional<z.ZodString>;
    stack: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodString>;
    snippet: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
      file: z.ZodString;
      line: z.ZodNumber;
      column: z.ZodNumber;
    }, z.core.$strip>>;
  }, z.core.$strip>>;
  steps: z.ZodArray<z.ZodObject<{
    title: z.ZodString;
    category: z.ZodString;
    durationMs: z.ZodNumber;
    depth: z.ZodNumber;
    startedAt: z.ZodString;
    error: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
      file: z.ZodString;
      line: z.ZodNumber;
      column: z.ZodNumber;
    }, z.core.$strip>>;
  }, z.core.$strip>>;
  stdout: z.ZodString;
  stderr: z.ZodString;
  annotations: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  attachments: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    contentType: z.ZodString;
    size: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  outcome: z.ZodEnum<{
    expected: "expected";
    flaky: "flaky";
    skipped: "skipped";
    unexpected: "unexpected";
  }>;
  isFinal: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
  seq: z.ZodNumber;
  type: z.ZodLiteral<"run.log">;
  level: z.ZodEnum<{
    error: "error";
    info: "info";
    warn: "warn";
  }>;
  message: z.ZodString;
}, z.core.$strip>], "type">;
export type IngestEvent = z.infer<typeof ingestEventSchema>;
export declare const eventBatchSchema: z.ZodObject<{
  shardIndex: z.ZodNumber;
  events: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    seq: z.ZodNumber;
    type: z.ZodLiteral<"test.begin">;
    testKey: z.ZodString;
    pwTestId: z.ZodString;
    title: z.ZodString;
    titlePath: z.ZodArray<z.ZodString>;
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
    project: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    annotations: z.ZodArray<z.ZodObject<{
      type: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    expectedStatus: z.ZodEnum<{
      failed: "failed";
      interrupted: "interrupted";
      passed: "passed";
      skipped: "skipped";
      timedOut: "timedOut";
    }>;
    retries: z.ZodNumber;
    retry: z.ZodNumber;
    workerIndex: z.ZodNumber;
    startedAt: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    seq: z.ZodNumber;
    type: z.ZodLiteral<"attempt.end">;
    testKey: z.ZodString;
    retry: z.ZodNumber;
    status: z.ZodEnum<{
      failed: "failed";
      interrupted: "interrupted";
      passed: "passed";
      skipped: "skipped";
      timedOut: "timedOut";
    }>;
    durationMs: z.ZodNumber;
    startedAt: z.ZodString;
    workerIndex: z.ZodNumber;
    parallelIndex: z.ZodNumber;
    errors: z.ZodArray<z.ZodObject<{
      message: z.ZodOptional<z.ZodString>;
      stack: z.ZodOptional<z.ZodString>;
      value: z.ZodOptional<z.ZodString>;
      snippet: z.ZodOptional<z.ZodString>;
      location: z.ZodOptional<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
      }, z.core.$strip>>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
      title: z.ZodString;
      category: z.ZodString;
      durationMs: z.ZodNumber;
      depth: z.ZodNumber;
      startedAt: z.ZodString;
      error: z.ZodOptional<z.ZodString>;
      location: z.ZodOptional<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
      }, z.core.$strip>>;
    }, z.core.$strip>>;
    stdout: z.ZodString;
    stderr: z.ZodString;
    annotations: z.ZodArray<z.ZodObject<{
      type: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    attachments: z.ZodArray<z.ZodObject<{
      id: z.ZodString;
      name: z.ZodString;
      contentType: z.ZodString;
      size: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    outcome: z.ZodEnum<{
      expected: "expected";
      flaky: "flaky";
      skipped: "skipped";
      unexpected: "unexpected";
    }>;
    isFinal: z.ZodBoolean;
  }, z.core.$strip>, z.ZodObject<{
    seq: z.ZodNumber;
    type: z.ZodLiteral<"run.log">;
    level: z.ZodEnum<{
      error: "error";
      info: "info";
      warn: "warn";
    }>;
    message: z.ZodString;
  }, z.core.$strip>], "type">>;
}, z.core.$strip>;
export type EventBatch = z.infer<typeof eventBatchSchema>;
export declare const eventBatchResponseSchema: z.ZodObject<{
  accepted: z.ZodNumber;
  lastSeq: z.ZodNumber;
}, z.core.$strip>;
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;
export declare const uploadUrlsRequestSchema: z.ZodObject<{
  attachmentIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type UploadUrlsRequest = z.infer<typeof uploadUrlsRequestSchema>;
export declare const uploadInstructionSchema: z.ZodObject<{
  attachmentId: z.ZodString;
  strategy: z.ZodEnum<{
    presigned: "presigned";
    proxy: "proxy";
  }>;
  method: z.ZodLiteral<"PUT">;
  url: z.ZodString;
  headers: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export type UploadInstruction = z.infer<typeof uploadInstructionSchema>;
export declare const uploadUrlsResponseSchema: z.ZodObject<{
  uploads: z.ZodArray<z.ZodObject<{
    attachmentId: z.ZodString;
    strategy: z.ZodEnum<{
      presigned: "presigned";
      proxy: "proxy";
    }>;
    method: z.ZodLiteral<"PUT">;
    url: z.ZodString;
    headers: z.ZodRecord<z.ZodString, z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
export type UploadUrlsResponse = z.infer<typeof uploadUrlsResponseSchema>;
/** Confirms a presigned upload; proxy uploads are confirmed by the upload itself. */
export declare const completeUploadRequestSchema: z.ZodObject<{
  size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type CompleteUploadRequest = z.infer<typeof completeUploadRequestSchema>;
export declare const completeUploadResponseSchema: z.ZodObject<{
  ok: z.ZodBoolean;
}, z.core.$strip>;
export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>;
export declare const runFinishSchema: z.ZodObject<{
  shardIndex: z.ZodNumber;
  status: z.ZodEnum<{
    failed: "failed";
    interrupted: "interrupted";
    passed: "passed";
    timedout: "timedout";
  }>;
  durationMs: z.ZodNumber;
  finishedAt: z.ZodString;
}, z.core.$strip>;
export type RunFinish = z.infer<typeof runFinishSchema>;
export declare const runFinishResponseSchema: z.ZodObject<{
  runStatus: z.ZodEnum<{
    failed: "failed";
    incomplete: "incomplete";
    interrupted: "interrupted";
    passed: "passed";
    running: "running";
    timedout: "timedout";
  }>;
  url: z.ZodString;
}, z.core.$strip>;
export type RunFinishResponse = z.infer<typeof runFinishResponseSchema>;
/**
 * `POST /api/ingest/runs/:runId/heartbeat`, sent on its own while tests run so
 * a silent stretch (a long test) is not taken for a dead reporter. Never part
 * of an event batch: a server without it would reject the whole batch. A
 * server without the endpoint answers 404, and the reporter stops sending.
 */
export declare const runHeartbeatSchema: z.ZodObject<{
  shardIndex: z.ZodNumber;
}, z.core.$strip>;
export type RunHeartbeat = z.infer<typeof runHeartbeatSchema>;
export declare const runHeartbeatResponseSchema: z.ZodObject<{
  runStatus: z.ZodEnum<{
    failed: "failed";
    incomplete: "incomplete";
    interrupted: "interrupted";
    passed: "passed";
    running: "running";
    timedout: "timedout";
  }>;
}, z.core.$strip>;
export type RunHeartbeatResponse = z.infer<typeof runHeartbeatResponseSchema>;
/** Classifies a Playwright attachment by name and content type. */
export declare function classifyAttachment(name: string, contentType: string): AttachmentKind;
//#endregion
//# sourceMappingURL=index.d.mts.map