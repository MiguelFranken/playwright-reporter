//#region src/types.d.ts
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
  batch?: {
    size?: number;
    intervalMs?: number;
  };
  /** How long onEnd waits for pending uploads (ms). Default 120000. */
  uploadTimeoutMs?: number;
  /**
   * The commit under test, for runs where neither a CI provider's variables nor
   * a git checkout say it (a test image in Kubernetes, say). Wins over what the
   * reporter detects. Env: PW_REPORTER_GIT_BRANCH, PW_REPORTER_GIT_SHA,
   * PW_REPORTER_GIT_MESSAGE, PW_REPORTER_GIT_REPO_URL, PW_REPORTER_GIT_AUTHOR
   */
  git?: GitOverrides;
  /**
   * The build that ran the tests, likewise. Env: PW_REPORTER_CI_PROVIDER,
   * PW_REPORTER_BUILD_URL, PW_REPORTER_BUILD_NUMBER, PW_REPORTER_CI_JOB
   */
  ci?: CiOverrides;
}
export interface GitOverrides {
  branch?: string;
  sha?: string;
  message?: string;
  repoUrl?: string;
  authorName?: string;
}
export interface CiOverrides {
  provider?: string;
  buildUrl?: string;
  buildNumber?: string;
  job?: string;
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
  maxRetries: number;
  git: GitOverrides;
  ci: CiOverrides;
}
//#endregion
//# sourceMappingURL=types.d.mts.map