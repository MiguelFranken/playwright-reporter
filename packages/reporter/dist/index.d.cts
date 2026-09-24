import { ReporterOptions } from "./types.cjs";
import { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from "@playwright/test/reporter";
//#region src/index.d.ts
declare class PlaywrightReporterApp implements Reporter {
  private readonly opts;
  private client;
  private queue;
  private config;
  private runId;
  private shardIndex;
  private runUrl;
  private startedAt;
  private startPromise;
  private uploads;
  private uploadPromises;
  private uploadedBytes;
  private disabled;
  constructor(options?: ReporterOptions);
  printsToStdio(): boolean;
  private log;
  private warn;
  onBegin(config: FullConfig, suite: Suite): void;
  onTestBegin(test: TestCase, result: TestResult): void;
  onTestEnd(test: TestCase, result: TestResult): void;
  onError(error: TestError): void;
  onEnd(result: FullResult): Promise<void>;
  onExit(): Promise<void>;
  private sendBatch;
  private scheduleUploads;
  private uploadBatch;
  private relFile;
  private titlePath;
  private testKey;
}
export = PlaywrightReporterApp;
//# sourceMappingURL=index.d.cts.map