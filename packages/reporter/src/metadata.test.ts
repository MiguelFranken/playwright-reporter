import { describe, expect, it } from 'vitest';
import type { FullConfig } from '@playwright/test/reporter';
import { collectCiInfo, collectGitInfo, collectPlaywrightInfo, collectSystemInfo, detectExecutor, normalizeRemote } from './metadata';

const config = (overrides: Partial<FullConfig> = {}) =>
  ({ rootDir: process.cwd(), projects: [], metadata: {}, ...overrides }) as FullConfig;

describe('detectExecutor', () => {
  it.each(['1', 'true', 'yes', 'anything'])('is ci when CI is %p', (ci) => {
    expect(detectExecutor({ CI: ci })).toBe('ci');
  });

  it.each([{}, { CI: '' }, { CI: 'false' }, { CI: '0' }, { CI: 'FALSE' }])('is local for %p', (env) => {
    expect(detectExecutor(env)).toBe('local');
  });
});

describe('collectCiInfo', () => {
  it('reads GitHub Actions', () => {
    expect(
      collectCiInfo({
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_NUMBER: '7',
        GITHUB_JOB: 'e2e',
      }),
    ).toEqual({
      provider: 'github-actions',
      buildUrl: 'https://github.com/acme/app/actions/runs/42',
      buildNumber: '7',
      job: 'e2e',
    });
  });

  it('honours a GitHub Enterprise server url', () => {
    const info = collectCiInfo({ GITHUB_ACTIONS: 'true', GITHUB_SERVER_URL: 'https://git.acme.test', GITHUB_REPOSITORY: 'a/b', GITHUB_RUN_ID: '1' });
    expect(info.buildUrl).toBe('https://git.acme.test/a/b/actions/runs/1');
  });

  it.each([
    {
      name: 'GitLab CI',
      env: { GITLAB_CI: 'true', CI_JOB_URL: 'https://gitlab.test/j/1', CI_PIPELINE_IID: '5', CI_JOB_NAME: 'test' },
      expected: { provider: 'gitlab-ci', buildUrl: 'https://gitlab.test/j/1', buildNumber: '5', job: 'test' },
    },
    {
      name: 'CircleCI',
      env: { CIRCLECI: 'true', CIRCLE_BUILD_URL: 'https://circle.test/1', CIRCLE_BUILD_NUM: '9', CIRCLE_JOB: 'e2e' },
      expected: { provider: 'circleci', buildUrl: 'https://circle.test/1', buildNumber: '9', job: 'e2e' },
    },
    {
      name: 'Buildkite',
      env: { BUILDKITE: 'true', BUILDKITE_BUILD_URL: 'https://bk.test/1', BUILDKITE_BUILD_NUMBER: '3', BUILDKITE_LABEL: ':sun:' },
      expected: { provider: 'buildkite', buildUrl: 'https://bk.test/1', buildNumber: '3', job: ':sun:' },
    },
    {
      name: 'Azure Pipelines',
      env: { TF_BUILD: 'True', BUILD_BUILDNUMBER: '20260917.1', SYSTEM_JOBDISPLAYNAME: 'E2E' },
      expected: { provider: 'azure-pipelines', buildNumber: '20260917.1', job: 'E2E' },
    },
    {
      name: 'Jenkins',
      env: { JENKINS_URL: 'https://jenkins.test', BUILD_URL: 'https://jenkins.test/job/1', BUILD_NUMBER: '1', JOB_NAME: 'e2e' },
      expected: { provider: 'jenkins', buildUrl: 'https://jenkins.test/job/1', buildNumber: '1', job: 'e2e' },
    },
  ])('reads $name', ({ env, expected }) => {
    expect(collectCiInfo(env)).toEqual(expected);
  });

  it('falls back to an unknown provider when only CI is set', () => {
    expect(collectCiInfo({ CI: '1' })).toEqual({ provider: 'unknown' });
  });

  it('is empty outside CI', () => {
    expect(collectCiInfo({})).toEqual({});
  });

  it('prefers GitHub Actions over a bare CI flag', () => {
    expect(collectCiInfo({ CI: '1', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'a/b' }).provider).toBe('github-actions');
  });
});

describe('normalizeRemote', () => {
  it.each([
    ['git@github.com:acme/app.git', 'https://github.com/acme/app'],
    ['git@github.com:acme/app', 'https://github.com/acme/app'],
    ['https://github.com/acme/app.git', 'https://github.com/acme/app'],
    ['ssh://git@github.com/acme/app.git', 'https://github.com/acme/app'],
    ['  https://gitlab.test/g/p.git  ', 'https://gitlab.test/g/p'],
  ])('turns %s into a browsable url', (remote, expected) => {
    expect(normalizeRemote(remote)).toBe(expected);
  });
});

describe('collectGitInfo', () => {
  it("prefers Playwright's own captured commit metadata", () => {
    const info = collectGitInfo(
      config({
        metadata: {
          gitCommit: {
            hash: 'a'.repeat(40),
            shortHash: 'aaaaaaa',
            subject: 'Fix the thing',
            branch: 'feature/x',
            author: { name: 'Dev', email: 'dev@example.test' },
          },
          ci: { prHref: 'https://github.com/acme/app/pull/1', commitHref: 'https://github.com/acme/app/commit/aaa' },
        },
      } as Partial<FullConfig>),
      {},
    );

    expect(info).toMatchObject({
      sha: 'a'.repeat(40),
      shortSha: 'aaaaaaa',
      message: 'Fix the thing',
      branch: 'feature/x',
      authorName: 'Dev',
      authorEmail: 'dev@example.test',
      prUrl: 'https://github.com/acme/app/pull/1',
      repoUrl: 'https://github.com/acme/app',
    });
  });

  it('fills the gaps from the GitHub environment, including the PR number', () => {
    const info = collectGitInfo(config(), {
      GITHUB_ACTIONS: 'true',
      GITHUB_SHA: 'b'.repeat(40),
      GITHUB_HEAD_REF: 'feature/y',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REF: 'refs/pull/123/merge',
    });

    expect(info).toMatchObject({
      sha: 'b'.repeat(40),
      shortSha: 'bbbbbbb',
      branch: 'feature/y',
      repoUrl: 'https://github.com/acme/app',
      prNumber: 123,
      prUrl: 'https://github.com/acme/app/pull/123',
    });
  });

  it('reads a GitLab merge request', () => {
    const info = collectGitInfo(config(), {
      GITLAB_CI: 'true',
      CI_COMMIT_SHA: 'c'.repeat(40),
      CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'mr-branch',
      CI_COMMIT_MESSAGE: 'Subject line\n\nBody that is dropped',
      CI_PROJECT_URL: 'https://gitlab.test/acme/app',
      CI_MERGE_REQUEST_IID: '77',
    });

    expect(info).toMatchObject({
      branch: 'mr-branch',
      message: 'Subject line',
      repoUrl: 'https://gitlab.test/acme/app',
      prNumber: 77,
    });
  });

  it('derives the short sha when only the full one is known', () => {
    const info = collectGitInfo(config(), { GITHUB_ACTIONS: 'true', GITHUB_SHA: 'd'.repeat(40), GITHUB_REPOSITORY: 'a/b' });
    expect(info.shortSha).toBe('ddddddd');
  });

  it('drops a detached HEAD instead of calling it a branch', () => {
    const info = collectGitInfo(config({ metadata: { gitCommit: { branch: 'HEAD' } } } as Partial<FullConfig>), {});
    expect(info.branch).not.toBe('HEAD');
  });

  it('falls back to the local repository, which this one is', () => {
    const info = collectGitInfo(config(), {});
    expect(info.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(info.shortSha).toHaveLength(7);
  });
});

describe('collectSystemInfo', () => {
  it('describes the machine the run happened on', () => {
    const info = collectSystemInfo();
    expect(info.os).toBe(process.platform);
    expect(info.arch).toBe(process.arch);
    expect(info.node).toBe(process.version);
    expect(info.cpus).toBeGreaterThan(0);
    expect(info.memoryBytes).toBeGreaterThan(0);
    expect(typeof info.hostname).toBe('string');
    expect(typeof info.timezone).toBe('string');
  });
});

describe('collectPlaywrightInfo', () => {
  it('flattens each project’s browser and viewport out of `use`', () => {
    const info = collectPlaywrightInfo(
      config({
        version: '1.63.0',
        workers: 4,
        configFile: '/app/playwright.config.ts',
        projects: [
          { name: 'chromium', retries: 2, timeout: 30_000, use: { browserName: 'chromium', viewport: { width: 1280, height: 720 }, baseURL: 'http://app.test', headless: true } },
          { name: 'webkit', retries: 0, timeout: 10_000, use: { defaultBrowserType: 'webkit', viewport: null } },
        ],
      } as unknown as Partial<FullConfig>),
    );

    expect(info).toMatchObject({ version: '1.63.0', workers: 4, configFile: '/app/playwright.config.ts' });
    expect(info.projects[0]).toEqual({
      name: 'chromium',
      browserName: 'chromium',
      viewport: { width: 1280, height: 720 },
      retries: 2,
      timeout: 30_000,
      baseURL: 'http://app.test',
      headless: true,
    });
    // `defaultBrowserType` is the fallback Playwright sets for the built-in devices.
    expect(info.projects[1]).toMatchObject({ name: 'webkit', browserName: 'webkit', viewport: null });
  });

  it('copes with a project that has no `use` block', () => {
    const info = collectPlaywrightInfo(config({ projects: [{ name: 'bare', retries: 0, timeout: 1 }] } as unknown as Partial<FullConfig>));
    expect(info.projects[0]).toMatchObject({ name: 'bare', viewport: null });
  });
});
