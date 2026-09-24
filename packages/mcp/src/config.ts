/**
 * Everything the bridge learns about its environment: the env vars it is configured with and the one piece of local
 * context it sends along (the checkout's git remote). This module decides *what* is sent; `bridge.ts` decides *how*.
 */
import { execFile } from 'node:child_process';

declare const __PW_REPORTER_MCP_VERSION__: string | undefined;

/**
 * The published package version, inlined by tsdown at build time (see tsdown.config.ts). Reading package.json at
 * runtime would be the only local file access in the bridge, so the build stamps it instead. Unbundled runs (vitest)
 * fall back to `0.0.0-dev`.
 */
export const VERSION: string = typeof __PW_REPORTER_MCP_VERSION__ === 'string' ? __PW_REPORTER_MCP_VERSION__ : '0.0.0-dev';

/** The remote endpoint's path, relative to the instance's base URL. */
const MCP_PATH = '/api/mcp';

/** Resolved bridge configuration. Only `endpoint` and `token` are required; the rest shape the remote connection. */
export interface BridgeConfig {
  /** The remote Streamable HTTP endpoint, `${PW_REPORTER_URL}/api/mcp`. */
  endpoint: URL;
  /** Personal access token, sent as a bearer token. Never logged. */
  token: string;
  /** Default `team/project` for tools that take a project (`X-PW-Reporter-Project`). */
  project?: string;
  /** Comma-separated toolsets to enable (`X-PW-Reporter-Toolsets`), passed through unparsed: the remote validates. */
  toolsets?: string;
  /** Whether to send the cwd's `origin` remote so the instance can pick the matching project. */
  detectRepo: boolean;
}

/**
 * A configuration problem the user has to fix in their MCP client's config. The message is written for humans and is
 * client-agnostic: the bridge can't know whether it runs under Claude Desktop, Cursor or something else.
 */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

const HELP: Record<'PW_REPORTER_URL' | 'PW_REPORTER_MCP_TOKEN', string> = {
  PW_REPORTER_URL: 'the base URL of your Playwright Reporter instance, e.g. https://reporter.example.com',
  PW_REPORTER_MCP_TOKEN:
    'a personal access token. Create one in the Playwright Reporter app under Account → Access tokens (it starts with "pwr_pat_")',
};

/**
 * Reads and validates the bridge's env vars. All missing required variables are reported at once, so a user editing a
 * JSON config file fixes everything in one round trip.
 *
 * @throws {ConfigError} when a required variable is missing or `PW_REPORTER_URL` is not an http(s) URL.
 */
export function loadConfig(env: NodeJS.ProcessEnv): BridgeConfig {
  const url = env.PW_REPORTER_URL?.trim();
  const token = env.PW_REPORTER_MCP_TOKEN?.trim();
  const missing = (['PW_REPORTER_URL', 'PW_REPORTER_MCP_TOKEN'] as const).filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    const lines = missing.map((name) => `  ${name}: ${HELP[name]}.`);
    throw new ConfigError(
      [
        `pw-reporter-mcp: missing required environment variable${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`,
        ...lines,
        'Set them in the "env" section of this server\'s entry in your MCP client configuration, then restart the client.',
      ].join('\n'),
    );
  }
  return {
    endpoint: mcpEndpoint(url!),
    token: token!,
    project: env.PW_REPORTER_PROJECT?.trim() || undefined,
    toolsets: env.PW_REPORTER_MCP_TOOLSETS?.trim() || undefined,
    detectRepo: parseBoolean(env.PW_REPORTER_MCP_DETECT_REPO, true),
  };
}

/**
 * Turns the instance base URL into the MCP endpoint. Users paste whatever they have — with or without a trailing
 * slash, sometimes the full endpoint URL copied from the app's setup page — so both forms are accepted.
 */
export function mcpEndpoint(base: string): URL {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    throw new ConfigError(`pw-reporter-mcp: PW_REPORTER_URL is not a valid URL: "${base}". Expected e.g. https://reporter.example.com.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`pw-reporter-mcp: PW_REPORTER_URL must be an http(s) URL, got "${base}".`);
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith(MCP_PATH) ? path : `${path}${MCP_PATH}`;
  url.search = '';
  url.hash = '';
  return url;
}

/** `false`, `0`, `no` and `off` (any case) disable; anything else set enables; unset or empty yields the default. */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  return !['false', '0', 'no', 'off'].includes(normalized);
}

/** The subset of `execFile` repo detection needs; injectable so tests don't depend on the machine's git. */
export type ExecFileLike = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number; windowsHide: boolean },
  callback: (error: Error | null, stdout: string) => void,
) => void;

/**
 * Asks git for the checkout's `origin` remote, so the instance can default to the project that reports from this repo
 * without the user configuring `PW_REPORTER_PROJECT`. Runs once at startup with a 2 s cap; every failure (no git, not
 * a repo, no origin, timeout) just means "unknown" and never blocks the bridge. This is the bridge's only interaction
 * with the local machine beyond stdio.
 */
export function detectRepo(cwd: string, run: ExecFileLike = execFile as unknown as ExecFileLike): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      run('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 2000, windowsHide: true }, (error, stdout) => {
        const remote = error ? '' : String(stdout).trim();
        resolve(remote && !/[\r\n]/.test(remote) ? remote : undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Headers sent on every request to the remote. `Authorization` is deliberately absent: the transport's `authProvider`
 * owns it, so the token lives in exactly one place.
 */
export function bridgeHeaders(config: BridgeConfig, repo: string | undefined, version: string = VERSION): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': `pw-reporter-mcp/${version}` };
  if (config.project) headers['X-PW-Reporter-Project'] = config.project;
  if (config.toolsets) headers['X-PW-Reporter-Toolsets'] = config.toolsets;
  if (repo) headers['X-PW-Reporter-Repo'] = repo;
  return headers;
}
