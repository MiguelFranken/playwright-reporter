import { randomUUID } from 'node:crypto';
import type { ReporterOptions, ResolvedOptions } from './types';

function envBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return !['false', '0', 'no', 'off', ''].includes(v.toLowerCase());
}

function envNumber(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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
    heartbeatIntervalMs: opts.heartbeatIntervalMs ?? envNumber(env.PW_REPORTER_HEARTBEAT_MS) ?? 30_000,
    maxRetries: 5,
  };
}

/** Whether Playwright was started to list the tests rather than run them. */
export function isListMode(argv: readonly string[] = process.argv) {
  return argv.includes('--list');
}
