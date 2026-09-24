/**
 * Setup snippets for connecting an AI assistant to this instance's MCP server.
 *
 * Pure functions of `(baseUrl, projectRef, token)` so the account page, the
 * "token created" dialog and the tests all produce byte-identical config — a
 * snippet that drifts from what the server accepts is worse than none. No JSX
 * and no directive: server code may read these too (see AGENTS.md, trap 2).
 */

/** The server name every client registers us under. Kebab-case, the shape every client accepts. */
export const MCP_SERVER_NAME = 'playwright-reporter';

/** Stands in for a real token, which is only ever shown once, at creation time. */
export const MCP_TOKEN_PLACEHOLDER = 'pwr_pat_…';

/** The stdio bridge for clients that cannot speak Streamable HTTP. Ships in phase 3. */
export const MCP_BRIDGE_PACKAGE = '@miguelfranken/mcp';

export interface McpSetupInput {
  /** Public origin of the instance, e.g. `https://reporter.acme.test`. A trailing slash is tolerated. */
  baseUrl: string;
  /** `team/project` to pin as the default project; omit to let the assistant ask each time. */
  projectRef?: string | null;
  /** A real token, when one was just minted. Defaults to {@link MCP_TOKEN_PLACEHOLDER}. */
  token?: string | null;
}

export type McpClientId = 'claude-code' | 'cursor' | 'vscode' | 'windsurf' | 'codex' | 'claude-desktop' | 'web';

export interface McpInstallLink {
  label: string;
  href: string;
}

export interface McpClientSetup {
  id: McpClientId;
  label: string;
  /** `coming-soon` clients render their snippet for reference, but it will not work yet. */
  status: 'available' | 'coming-soon';
  /** Where the snippet goes: a file path, or `Terminal`. */
  location: string;
  language: 'bash' | 'json' | 'toml' | 'text';
  snippet: string;
  /** One or two sentences shown above the snippet. */
  note: string;
  installLink?: McpInstallLink;
}

/** Tab order on the setup page: the clients most people use first, the not-yet-working ones last. */
export const MCP_CLIENT_IDS: readonly McpClientId[] = ['claude-code', 'cursor', 'vscode', 'windsurf', 'codex', 'claude-desktop', 'web'];

function origin(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

function tokenOf(input: McpSetupInput) {
  return input.token?.trim() || MCP_TOKEN_PLACEHOLDER;
}

function projectOf(input: McpSetupInput) {
  return input.projectRef?.trim() || null;
}

/**
 * The endpoint a client connects to. The project is pinned as a query
 * parameter rather than a header because every client can carry a URL, while
 * custom headers are the part of the config people most often get wrong.
 */
export function mcpUrl(input: McpSetupInput): string {
  const url = `${origin(input.baseUrl)}/api/mcp`;
  const project = projectOf(input);
  return project ? `${url}?project=${encodeURIComponent(project)}` : url;
}

function authHeaders(input: McpSetupInput) {
  return { Authorization: `Bearer ${tokenOf(input)}` };
}

/** The `{ url, headers }` object Cursor stores per server — also what its install link carries. */
function cursorServer(input: McpSetupInput) {
  return { url: mcpUrl(input), headers: authHeaders(input) };
}

/** VS Code needs an explicit transport `type`; without it the entry is read as a stdio command. */
function vscodeServer(input: McpSetupInput) {
  return { type: 'http' as const, url: mcpUrl(input), headers: authHeaders(input) };
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Single quotes keep zsh from globbing the `?` in a project-pinned URL. */
function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** TOML basic strings share JSON's escapes for everything a URL or token contains. */
const tomlString = (value: string) => JSON.stringify(value);

export function claudeCodeSnippet(input: McpSetupInput): string {
  return [
    `claude mcp add --transport http ${MCP_SERVER_NAME} ${shellQuote(mcpUrl(input))} \\`,
    `  --header ${shellQuote(`Authorization: Bearer ${tokenOf(input)}`)}`,
  ].join('\n');
}

export function cursorSnippet(input: McpSetupInput): string {
  return json({ mcpServers: { [MCP_SERVER_NAME]: cursorServer(input) } });
}

export function vscodeSnippet(input: McpSetupInput): string {
  return json({ servers: { [MCP_SERVER_NAME]: vscodeServer(input) } });
}

/** Windsurf names the remote endpoint `serverUrl`, not `url`. */
export function windsurfSnippet(input: McpSetupInput): string {
  return json({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: mcpUrl(input), headers: authHeaders(input) } } });
}

/**
 * Codex reads streamable-HTTP servers from `[mcp_servers.<name>]` with `url`
 * and static `http_headers`. It also offers `bearer_token_env_var`, which keeps
 * the token out of the file; we show the literal header so the snippet works
 * as pasted, like every other tab. **verify** the keys against the Codex docs
 * when upgrading; they have been renamed before.
 */
export function codexSnippet(input: McpSetupInput): string {
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `url = ${tomlString(mcpUrl(input))}`,
    `http_headers = { Authorization = ${tomlString(`Bearer ${tokenOf(input)}`)} }`,
  ].join('\n');
}

/**
 * Claude Desktop only launches local stdio servers from its config file, so it
 * goes through the bridge. The bridge takes the instance origin, not the
 * endpoint: it appends `/api/mcp` itself and can detect the project from git.
 */
export function claudeDesktopSnippet(input: McpSetupInput): string {
  const project = projectOf(input);
  const env: Record<string, string> = { PW_REPORTER_URL: origin(input.baseUrl), PW_REPORTER_MCP_TOKEN: tokenOf(input) };
  if (project) env.PW_REPORTER_PROJECT = project;
  return json({ mcpServers: { [MCP_SERVER_NAME]: { command: 'npx', args: ['-y', MCP_BRIDGE_PACKAGE], env } } });
}

/** UTF-8 safe base64 that runs the same in the browser and in Node. */
function base64(value: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Cursor's one-click install: `config` is the base64 of the single server
 * object (not the whole `mcpServers` map). Cursor shows it for confirmation
 * before saving, so a token inside it is never installed silently.
 */
export function cursorInstallLink(input: McpSetupInput): string {
  const params = new URLSearchParams({ name: MCP_SERVER_NAME, config: base64(JSON.stringify(cursorServer(input))) });
  return `cursor://anysphere.cursor-deeplink/mcp/install?${params.toString()}`;
}

/** VS Code's one-click install: the URL-encoded server object, `name` included, straight after the `?`. */
export function vscodeInstallLink(input: McpSetupInput): string {
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: MCP_SERVER_NAME, ...vscodeServer(input) }))}`;
}

/** Every client's setup, in tab order. */
export function mcpClientSetups(input: McpSetupInput): McpClientSetup[] {
  const byId: Record<McpClientId, McpClientSetup> = {
    'claude-code': {
      id: 'claude-code',
      label: 'Claude Code',
      status: 'available',
      location: 'Terminal',
      language: 'bash',
      snippet: claudeCodeSnippet(input),
      note: 'Run this once in a terminal. The server is then available in every Claude Code session on this machine. Without the --header line, Claude Code signs in through the browser instead (/mcp → Authenticate).',
    },
    cursor: {
      id: 'cursor',
      label: 'Cursor',
      status: 'available',
      location: '.cursor/mcp.json',
      language: 'json',
      snippet: cursorSnippet(input),
      note: 'Install with one click, or add this to .cursor/mcp.json in the repository (or ~/.cursor/mcp.json for every project).',
      installLink: { label: 'Add to Cursor', href: cursorInstallLink(input) },
    },
    vscode: {
      id: 'vscode',
      label: 'VS Code',
      status: 'available',
      location: '.vscode/mcp.json',
      language: 'json',
      snippet: vscodeSnippet(input),
      note: 'Install with one click, or add this to .vscode/mcp.json. Copilot Chat picks the server up in agent mode.',
      installLink: { label: 'Add to VS Code', href: vscodeInstallLink(input) },
    },
    windsurf: {
      id: 'windsurf',
      label: 'Windsurf',
      status: 'available',
      location: '~/.codeium/windsurf/mcp_config.json',
      language: 'json',
      snippet: windsurfSnippet(input),
      note: 'Add this to ~/.codeium/windsurf/mcp_config.json, then refresh the MCP servers in Cascade.',
    },
    codex: {
      id: 'codex',
      label: 'Codex',
      status: 'available',
      location: '~/.codex/config.toml',
      language: 'toml',
      snippet: codexSnippet(input),
      note: 'Add this to ~/.codex/config.toml. The Codex CLI and the IDE extension share the file.',
    },
    'claude-desktop': {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      status: 'available',
      location: 'claude_desktop_config.json',
      language: 'json',
      snippet: claudeDesktopSnippet(input),
      note: `Claude Desktop starts local servers from this file, so it connects through the ${MCP_BRIDGE_PACKAGE} bridge (published next to the reporter; set up .npmrc the same way). Alternatively add the server URL as a connector and sign in, like claude.ai.`,
    },
    web: {
      id: 'web',
      label: 'claude.ai / ChatGPT',
      status: 'available',
      location: 'Custom connector URL',
      language: 'text',
      snippet: mcpUrl({ ...input, token: null }),
      note: 'Add a custom connector with this URL (claude.ai: Settings → Connectors; ChatGPT: Settings → Apps). You sign in here and choose what it may read; disconnect it any time under Account → Connected apps.',
    },
  };
  return MCP_CLIENT_IDS.map((id) => byId[id]);
}
