import { randomUUID } from 'node:crypto';
import type { CiOverrides, GitOverrides, ReporterOptions, ResolvedOptions } from './types';

function envBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return !['false', '0', 'no', 'off', ''].includes(v.toLowerCase());
}

export function detectCiRunId(env: NodeJS.ProcessEnv): string | undefined {
  if (env.GITHUB_RUN_ID) return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`;
  if (env.CI_PIPELINE_ID) return `gl-${env.CI_PIPELINE_ID}`;
  if (env.CIRCLE_WORKFLOW_ID) return `circle-${env.CIRCLE_WORKFLOW_ID}`;
  if (env.BUILDKITE_BUILD_ID) return `bk-${env.BUILDKITE_BUILD_ID}`;
  if (env.BUILD_BUILDID) return `azp-${env.BUILD_BUILDID}`;
  if (env.BUILD_NUMBER && env.JENKINS_URL) return `jenkins-${env.JOB_NAME ?? 'job'}-${env.BUILD_NUMBER}`;
  return undefined;
}

/** Drops unset and blank values, so an empty env var (`E2E_COMMIT_SHA: ""`) overrides nothing. */
function defined<T extends object>(values: Record<string, string | undefined>): T {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v)) as T;
}

export function resolveOptions(
  opts: ReporterOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOptions | null {
  const token = opts.token ?? env.PW_REPORTER_TOKEN;
  const serverUrl = (opts.serverUrl ?? env.PW_REPORTER_URL)?.replace(/\/+$/, '');
  if (!token || !serverUrl) return null;
  const tags =
    opts.tags ??
    (env.PW_REPORTER_TAGS
      ? env.PW_REPORTER_TAGS.split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : []);
  return {
    token,
    serverUrl,
    ciRunId: opts.ciRunId ?? env.PW_REPORTER_CI_RUN_ID ?? detectCiRunId(env) ?? randomUUID(),
    tags,
    environment: opts.environment ?? env.PW_REPORTER_ENVIRONMENT,
    artifacts: opts.artifacts ?? envBool(env.PW_REPORTER_ARTIFACTS) ?? true,
    debug: opts.debug ?? envBool(env.PW_REPORTER_DEBUG) ?? false,
    batchSize: opts.batch?.size ?? 50,
    // Two seconds: the live views stay current and a run sends half the requests of one second.
    batchIntervalMs: opts.batch?.intervalMs ?? 2000,
    uploadTimeoutMs: opts.uploadTimeoutMs ?? 120_000,
    maxRetries: 5,
    git: defined<GitOverrides>({
      branch: opts.git?.branch ?? env.PW_REPORTER_GIT_BRANCH,
      sha: opts.git?.sha ?? env.PW_REPORTER_GIT_SHA,
      message: opts.git?.message ?? env.PW_REPORTER_GIT_MESSAGE,
      repoUrl: opts.git?.repoUrl ?? env.PW_REPORTER_GIT_REPO_URL,
      authorName: opts.git?.authorName ?? env.PW_REPORTER_GIT_AUTHOR,
    }),
    ci: defined<CiOverrides>({
      provider: opts.ci?.provider ?? env.PW_REPORTER_CI_PROVIDER,
      buildUrl: opts.ci?.buildUrl ?? env.PW_REPORTER_BUILD_URL,
      buildNumber: opts.ci?.buildNumber ?? env.PW_REPORTER_BUILD_NUMBER,
      job: opts.ci?.job ?? env.PW_REPORTER_CI_JOB,
    }),
  };
}

/** Whether Playwright was started to list the tests rather than run them. */
export function isListMode(argv: readonly string[] = process.argv) {
  return argv.includes('--list');
}
