import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test/reporter';
import type { CiInfo, Executor, GitInfo, PlaywrightInfo, SystemInfo } from '@repo/protocol';

function git(args: string[], cwd: string): string | undefined {
  try {
    return (
      execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 })
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function detectExecutor(env: NodeJS.ProcessEnv): Executor {
  return env.CI && !['false', '0'].includes(env.CI.toLowerCase()) ? 'ci' : 'local';
}

export function collectCiInfo(env: NodeJS.ProcessEnv): CiInfo {
  if (env.GITHUB_ACTIONS) {
    const base = `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}`;
    return {
      provider: 'github-actions',
      buildUrl: env.GITHUB_RUN_ID ? `${base}/actions/runs/${env.GITHUB_RUN_ID}` : undefined,
      buildNumber: env.GITHUB_RUN_NUMBER,
      job: env.GITHUB_JOB,
    };
  }
  if (env.GITLAB_CI)
    return { provider: 'gitlab-ci', buildUrl: env.CI_JOB_URL, buildNumber: env.CI_PIPELINE_IID, job: env.CI_JOB_NAME };
  if (env.CIRCLECI)
    return { provider: 'circleci', buildUrl: env.CIRCLE_BUILD_URL, buildNumber: env.CIRCLE_BUILD_NUM, job: env.CIRCLE_JOB };
  if (env.BUILDKITE)
    return {
      provider: 'buildkite',
      buildUrl: env.BUILDKITE_BUILD_URL,
      buildNumber: env.BUILDKITE_BUILD_NUMBER,
      job: env.BUILDKITE_LABEL,
    };
  if (env.TF_BUILD)
    return { provider: 'azure-pipelines', buildNumber: env.BUILD_BUILDNUMBER, job: env.SYSTEM_JOBDISPLAYNAME };
  if (env.JENKINS_URL) return { provider: 'jenkins', buildUrl: env.BUILD_URL, buildNumber: env.BUILD_NUMBER, job: env.JOB_NAME };
  if (env.CI) return { provider: 'unknown' };
  return {};
}

export function collectGitInfo(config: FullConfig, env: NodeJS.ProcessEnv): GitInfo {
  const info: GitInfo = {};
  // 1. Playwright's captureGitInfo output (structure documented as subject to change).
  const meta = (config.metadata ?? {}) as Record<string, any>;
  const gc = meta.gitCommit as Record<string, any> | undefined;
  if (gc) {
    info.sha = gc.hash;
    info.shortSha = gc.shortHash;
    info.message = gc.subject;
    info.authorName = gc.author?.name;
    info.authorEmail = gc.author?.email;
    info.branch = gc.branch;
  }
  const ci = meta.ci as Record<string, any> | undefined;
  if (ci) {
    info.branch ??= ci.branch;
    info.prUrl ??= ci.prHref;
    if (ci.commitHref && !info.repoUrl) info.repoUrl = String(ci.commitHref).replace(/\/(commit|-\/commit)\/.*$/, '');
  }
  // 2. CI environment variables.
  if (env.GITHUB_ACTIONS) {
    info.sha ??= env.GITHUB_SHA;
    info.branch ??= env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
    info.repoUrl ??= `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}`;
    if (env.GITHUB_EVENT_NAME?.startsWith('pull_request') && env.GITHUB_REF) {
      const m = /refs\/pull\/(\d+)\//.exec(env.GITHUB_REF);
      if (m) {
        info.prNumber = num(m[1]);
        info.prUrl ??= `${info.repoUrl}/pull/${m[1]}`;
      }
    }
  } else if (env.GITLAB_CI) {
    info.sha ??= env.CI_COMMIT_SHA;
    info.branch ??= env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || env.CI_COMMIT_REF_NAME;
    info.message ??= env.CI_COMMIT_MESSAGE?.split('\n')[0];
    info.repoUrl ??= env.CI_PROJECT_URL;
    info.prNumber ??= num(env.CI_MERGE_REQUEST_IID);
  }
  // 3. Local git.
  const cwd = config.rootDir || process.cwd();
  info.sha ??= git(['rev-parse', 'HEAD'], cwd);
  info.branch ??= git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  info.message ??= git(['log', '-1', '--pretty=%s'], cwd);
  info.authorName ??= git(['log', '-1', '--pretty=%an'], cwd);
  info.authorEmail ??= git(['log', '-1', '--pretty=%ae'], cwd);
  if (!info.repoUrl) {
    const remote = git(['config', '--get', 'remote.origin.url'], cwd);
    if (remote) info.repoUrl = normalizeRemote(remote);
  }
  if (info.sha && !info.shortSha) info.shortSha = info.sha.slice(0, 7);
  if (info.branch === 'HEAD') info.branch = undefined;
  return info;
}

export function normalizeRemote(remote: string): string {
  let r = remote.trim().replace(/\.git$/, '');
  const ssh = /^git@([^:]+):(.+)$/.exec(r);
  if (ssh) r = `https://${ssh[1]}/${ssh[2]}`;
  r = r.replace(/^ssh:\/\/git@/, 'https://');
  return r;
}

export function collectSystemInfo(): SystemInfo {
  return {
    os: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    node: process.version,
    hostname: os.hostname(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function collectPlaywrightInfo(config: FullConfig): PlaywrightInfo {
  return {
    version: config.version,
    workers: config.workers,
    configFile: config.configFile,
    projects: config.projects.map((p) => {
      const use = (p.use ?? {}) as Record<string, any>;
      return {
        name: p.name,
        browserName: use.browserName ?? use.defaultBrowserType,
        viewport: use.viewport ?? null,
        retries: p.retries,
        timeout: p.timeout,
        baseURL: use.baseURL,
        headless: use.headless,
      };
    }),
  };
}
