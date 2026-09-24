import { describe, expect, it } from 'vitest';
import { bridgeHeaders, ConfigError, detectRepo, loadConfig, mcpEndpoint, parseBoolean, type ExecFileLike } from './config';

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars;

describe('loadConfig', () => {
  it('names every missing required variable and says where tokens come from', () => {
    const error = (() => {
      try {
        loadConfig(env({}));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toMatch(/missing required environment variables PW_REPORTER_URL, PW_REPORTER_MCP_TOKEN/);
    expect(message).toMatch(/Account → Access tokens/);
    // Client-agnostic: the bridge can't know which MCP client launched it.
    expect(message).not.toMatch(/Claude|Cursor/);
  });

  it('reports a single missing variable', () => {
    expect(() => loadConfig(env({ PW_REPORTER_URL: 'https://reporter.example.com' }))).toThrow(
      /missing required environment variable PW_REPORTER_MCP_TOKEN\./,
    );
    expect(() => loadConfig(env({ PW_REPORTER_URL: '  ', PW_REPORTER_MCP_TOKEN: 'pwr_pat_x' }))).toThrow(/variable PW_REPORTER_URL\./);
  });

  it('reads optional settings, defaulting repo detection to on', () => {
    expect(loadConfig(env({ PW_REPORTER_URL: 'https://reporter.example.com/', PW_REPORTER_MCP_TOKEN: ' pwr_pat_x ' }))).toEqual({
      endpoint: new URL('https://reporter.example.com/api/mcp'),
      token: 'pwr_pat_x',
      project: undefined,
      toolsets: undefined,
      detectRepo: true,
    });
    expect(
      loadConfig(
        env({
          PW_REPORTER_URL: 'https://reporter.example.com',
          PW_REPORTER_MCP_TOKEN: 'pwr_pat_x',
          PW_REPORTER_PROJECT: 'acme/api',
          PW_REPORTER_MCP_TOOLSETS: 'core,debug',
          PW_REPORTER_MCP_DETECT_REPO: 'false',
        }),
      ),
    ).toMatchObject({ project: 'acme/api', toolsets: 'core,debug', detectRepo: false });
  });
});

describe('mcpEndpoint', () => {
  it.each([
    ['https://reporter.example.com', 'https://reporter.example.com/api/mcp'],
    ['https://reporter.example.com///', 'https://reporter.example.com/api/mcp'],
    ['https://reporter.example.com/api/mcp', 'https://reporter.example.com/api/mcp'],
    ['https://reporter.example.com/api/mcp/', 'https://reporter.example.com/api/mcp'],
    ['https://example.com/reporter/', 'https://example.com/reporter/api/mcp'],
    ['http://localhost:3000?x=1#y', 'http://localhost:3000/api/mcp'],
  ])('%s → %s', (input, expected) => {
    expect(mcpEndpoint(input).href).toBe(expected);
  });

  it('rejects values that are not http(s) URLs', () => {
    expect(() => mcpEndpoint('reporter.example.com')).toThrow(ConfigError);
    expect(() => mcpEndpoint('ftp://reporter.example.com')).toThrow(/must be an http\(s\) URL/);
  });
});

describe('parseBoolean', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['off', false],
    ['no', false],
    ['true', true],
    ['1', true],
  ])('%s → %s', (value, expected) => {
    expect(parseBoolean(value, true)).toBe(expected);
  });
});

describe('detectRepo', () => {
  const fake =
    (error: Error | null, stdout = ''): ExecFileLike =>
    (_file, _args, _options, callback) =>
      callback(error, stdout);

  it('runs `git remote get-url origin` once in cwd with a 2 s timeout', async () => {
    const calls: unknown[][] = [];
    const run: ExecFileLike = (file, args, options, callback) => {
      calls.push([file, args, options]);
      callback(null, 'git@github.com:acme/api.git\n');
    };
    await expect(detectRepo('/work/api', run)).resolves.toBe('git@github.com:acme/api.git');
    expect(calls).toEqual([['git', ['remote', 'get-url', 'origin'], { cwd: '/work/api', timeout: 2000, windowsHide: true }]]);
  });

  it('ignores every failure', async () => {
    await expect(detectRepo('/tmp', fake(new Error('not a git repository')))).resolves.toBeUndefined();
    await expect(detectRepo('/tmp', fake(null, '  '))).resolves.toBeUndefined();
    await expect(
      detectRepo('/tmp', () => {
        throw new Error('spawn git ENOENT');
      }),
    ).resolves.toBeUndefined();
  });
});

describe('bridgeHeaders', () => {
  const config = { endpoint: new URL('https://r.test/api/mcp'), token: 'pwr_pat_x', detectRepo: true };

  it('always identifies the bridge and never carries the token', () => {
    expect(bridgeHeaders(config, undefined, '1.2.3')).toEqual({ 'User-Agent': 'pw-reporter-mcp/1.2.3' });
  });

  it('adds project, toolsets and repo when known', () => {
    expect(bridgeHeaders({ ...config, project: 'acme/api', toolsets: 'debug' }, 'https://github.com/acme/api', '1.2.3')).toEqual({
      'User-Agent': 'pw-reporter-mcp/1.2.3',
      'X-PW-Reporter-Project': 'acme/api',
      'X-PW-Reporter-Toolsets': 'debug',
      'X-PW-Reporter-Repo': 'https://github.com/acme/api',
    });
  });
});
