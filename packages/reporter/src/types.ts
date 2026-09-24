export interface ReporterOptions {
  /** Project API token. Env: PW_REPORTER_TOKEN */
  token?: string;
  /** Base URL of the reporter app, e.g. https://reports.example.com. Env: PW_REPORTER_URL */
  serverUrl?: string;
  /** Groups shards of one CI job into one run. Env: PW_REPORTER_CI_RUN_ID */
  ciRunId?: string;
  /** Run-level tags. Env: PW_REPORTER_TAGS (comma separated) */
  tags?: string[];
  /** Environment label, e.g. "staging". Env: PW_REPORTER_ENVIRONMENT */
  environment?: string;
  /** Upload screenshots, videos, traces and other attachments. Env: PW_REPORTER_ARTIFACTS=false disables. */
  artifacts?: boolean;
  /** Verbose logging. Env: PW_REPORTER_DEBUG */
  debug?: boolean;
  /** Batching tuning. */
  batch?: { size?: number; intervalMs?: number };
  /** How long onEnd waits for pending uploads (ms). Default 120000. */
  uploadTimeoutMs?: number;
  /**
   * How often the run tells the server it is alive while tests run (ms), so a
   * long silent stretch is not taken for a dead reporter. 0 disables.
   * Default 30000. Env: PW_REPORTER_HEARTBEAT_MS
   */
  heartbeatIntervalMs?: number;
}

export interface ResolvedOptions {
  token: string;
  serverUrl: string;
  ciRunId: string;
  tags: string[];
  environment?: string;
  artifacts: boolean;
  debug: boolean;
  batchSize: number;
  batchIntervalMs: number;
  uploadTimeoutMs: number;
  heartbeatIntervalMs: number;
  maxRetries: number;
}
