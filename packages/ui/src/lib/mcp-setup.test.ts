import { describe, expect, it } from 'vitest';
import {
  MCP_CLIENT_IDS,
  MCP_TOKEN_PLACEHOLDER,
  claudeCodeSnippet,
  claudeDesktopSnippet,
  codexSnippet,
  cursorInstallLink,
  cursorSnippet,
  mcpClientSetups,
  mcpUrl,
  vscodeInstallLink,
  vscodeSnippet,
  windsurfSnippet,
} from './mcp-setup';

const BASE = 'https://reporter.acme.test';
const PINNED = { baseUrl: BASE, projectRef: 'acme/web' };

describe('mcpUrl', () => {
  it('points at /api/mcp and tolerates a trailing slash', () => {
    expect(mcpUrl({ baseUrl: `${BASE}/` })).toBe(`${BASE}/api/mcp`);
  });

  it('pins the project as an encoded query parameter', () => {
    expect(mcpUrl(PINNED)).toBe(`${BASE}/api/mcp?project=acme%2Fweb`);
  });

  it('treats an empty project as none', () => {
    expect(mcpUrl({ baseUrl: BASE, projectRef: '  ' })).toBe(`${BASE}/api/mcp`);
  });
});

describe('snippets', () => {
  it('Claude Code quotes the URL so the shell does not glob the query string', () => {
    expect(claudeCodeSnippet(PINNED)).toBe(
      `claude mcp add --transport http playwright-reporter '${BASE}/api/mcp?project=acme%2Fweb' \\\n` +
        `  --header 'Authorization: Bearer ${MCP_TOKEN_PLACEHOLDER}'`,
    );
  });

  it('Cursor uses mcpServers with url and headers', () => {
    expect(JSON.parse(cursorSnippet({ baseUrl: BASE, token: 'pwr_pat_abc' }))).toEqual({
      mcpServers: { 'playwright-reporter': { url: `${BASE}/api/mcp`, headers: { Authorization: 'Bearer pwr_pat_abc' } } },
    });
  });

  it('VS Code uses servers with an explicit http type', () => {
    expect(JSON.parse(vscodeSnippet(PINNED))).toEqual({
      servers: {
        'playwright-reporter': {
          type: 'http',
          url: `${BASE}/api/mcp?project=acme%2Fweb`,
          headers: { Authorization: `Bearer ${MCP_TOKEN_PLACEHOLDER}` },
        },
      },
    });
  });

  it('Windsurf names the endpoint serverUrl', () => {
    const server = JSON.parse(windsurfSnippet({ baseUrl: BASE })).mcpServers['playwright-reporter'];
    expect(server).toEqual({ serverUrl: `${BASE}/api/mcp`, headers: { Authorization: `Bearer ${MCP_TOKEN_PLACEHOLDER}` } });
  });

  it('Codex writes a TOML table with url and http_headers', () => {
    expect(codexSnippet({ ...PINNED, token: 'pwr_pat_abc' })).toBe(
      [
        '[mcp_servers.playwright-reporter]',
        `url = "${BASE}/api/mcp?project=acme%2Fweb"`,
        'http_headers = { Authorization = "Bearer pwr_pat_abc" }',
      ].join('\n'),
    );
  });

  it('Claude Desktop runs the bridge with the origin, token and project in its environment', () => {
    const server = JSON.parse(claudeDesktopSnippet({ ...PINNED, baseUrl: `${BASE}/` })).mcpServers['playwright-reporter'];
    expect(server).toEqual({
      command: 'npx',
      args: ['-y', '@miguelfranken/mcp'],
      env: { PW_REPORTER_URL: BASE, PW_REPORTER_MCP_TOKEN: MCP_TOKEN_PLACEHOLDER, PW_REPORTER_PROJECT: 'acme/web' },
    });
  });

  it('Claude Desktop leaves the project out when none is pinned', () => {
    expect(JSON.parse(claudeDesktopSnippet({ baseUrl: BASE })).mcpServers['playwright-reporter'].env).not.toHaveProperty(
      'PW_REPORTER_PROJECT',
    );
  });
});

describe('install links', () => {
  it('Cursor carries the base64 server object', () => {
    const link = new URL(cursorInstallLink(PINNED));
    expect(link.protocol).toBe('cursor:');
    expect(`${link.host}${link.pathname}`).toBe('anysphere.cursor-deeplink/mcp/install');
    expect(link.searchParams.get('name')).toBe('playwright-reporter');
    const config = JSON.parse(Buffer.from(link.searchParams.get('config')!, 'base64').toString('utf8'));
    expect(config).toEqual({ url: `${BASE}/api/mcp?project=acme%2Fweb`, headers: { Authorization: `Bearer ${MCP_TOKEN_PLACEHOLDER}` } });
  });

  it('Cursor encodes non-ASCII (the placeholder ellipsis) as UTF-8', () => {
    const config = new URL(cursorInstallLink({ baseUrl: BASE })).searchParams.get('config')!;
    expect(Buffer.from(config, 'base64').toString('utf8')).toContain('pwr_pat_…');
  });

  it('VS Code carries the URL-encoded server object with its name', () => {
    const link = vscodeInstallLink(PINNED);
    expect(link.startsWith('vscode:mcp/install?')).toBe(true);
    expect(JSON.parse(decodeURIComponent(link.slice('vscode:mcp/install?'.length)))).toEqual({
      name: 'playwright-reporter',
      type: 'http',
      url: `${BASE}/api/mcp?project=acme%2Fweb`,
      headers: { Authorization: `Bearer ${MCP_TOKEN_PLACEHOLDER}` },
    });
  });
});

describe('mcpClientSetups', () => {
  it('lists every client in tab order', () => {
    expect(mcpClientSetups({ baseUrl: BASE }).map((c) => c.id)).toEqual([...MCP_CLIENT_IDS]);
  });

  it('marks the bridge and OAuth clients as coming soon, and only they', () => {
    const soon = mcpClientSetups({ baseUrl: BASE }).filter((c) => c.status === 'coming-soon');
    expect(soon.map((c) => c.id)).toEqual(['claude-desktop', 'web']);
  });

  it('offers install links for Cursor and VS Code only', () => {
    const withLinks = mcpClientSetups({ baseUrl: BASE }).filter((c) => c.installLink);
    expect(withLinks.map((c) => c.id)).toEqual(['cursor', 'vscode']);
  });

  it('embeds a real token everywhere except the web connector, which signs in instead', () => {
    const setups = mcpClientSetups({ ...PINNED, token: 'pwr_pat_secret' });
    for (const setup of setups) {
      if (setup.id === 'web') expect(setup.snippet).toBe(`${BASE}/api/mcp?project=acme%2Fweb`);
      else expect(setup.snippet).toContain('pwr_pat_secret');
    }
  });
});
