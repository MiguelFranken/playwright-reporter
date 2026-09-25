import { z } from "zod";
//#region src/contract.d.ts
export declare const INGEST_PREFIX = "/api/ingest";
export declare const ingestContract: {
  runs: {
    start: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
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
    }, z.core.$strip>, z.ZodObject<{
      runId: z.ZodString;
      runNumber: z.ZodNumber;
      shardIndex: z.ZodNumber;
      url: z.ZodString;
    }, z.core.$strip>, object>;
    events: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
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
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      accepted: z.ZodNumber;
      lastSeq: z.ZodNumber;
    }, z.core.$strip>, object>;
    heartbeat: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      shardIndex: z.ZodNumber;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      runStatus: z.ZodEnum<{
        failed: "failed";
        incomplete: "incomplete";
        interrupted: "interrupted";
        passed: "passed";
        running: "running";
        timedout: "timedout";
      }>;
    }, z.core.$strip>, object>;
    finish: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      shardIndex: z.ZodNumber;
      status: z.ZodEnum<{
        failed: "failed";
        interrupted: "interrupted";
        passed: "passed";
        timedout: "timedout";
      }>;
      durationMs: z.ZodNumber;
      finishedAt: z.ZodString;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      runStatus: z.ZodEnum<{
        failed: "failed";
        incomplete: "incomplete";
        interrupted: "interrupted";
        passed: "passed";
        running: "running";
        timedout: "timedout";
      }>;
      url: z.ZodString;
    }, z.core.$strip>, object>;
  };
  attachments: {
    uploadUrls: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      attachmentIds: z.ZodArray<z.ZodString>;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
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
    }, z.core.$strip>, object>;
    complete: import("@orpc/contract").ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      size: z.ZodOptional<z.ZodNumber>;
      runId: z.ZodString;
      attachmentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      ok: z.ZodBoolean;
    }, z.core.$strip>, object>;
  };
};
export type IngestContract = typeof ingestContract;
//#endregion
//# sourceMappingURL=contract.d.cts.map