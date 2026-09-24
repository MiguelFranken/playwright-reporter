# @miguelfranken/mcp

A stdio bridge to a Playwright Reporter instance's MCP server, for MCP clients that can only launch local processes.

`pw-reporter-mcp` runs as a local stdio MCP server and forwards every request to your instance's Streamable HTTP
endpoint at `${PW_REPORTER_URL}/api/mcp`. It contains no tool logic: tools, prompts, resources and instructions all
come from the instance, so upgrading the instance never requires a new bridge.

> **Prefer the remote endpoint.** If your client supports remote (Streamable HTTP) MCP servers, connect it straight
> to `https://<your-instance>/api/mcp` with your token as a bearer token. You don't need this package then. The
> app's **AI assistants** page shows the exact snippet for each client.

## Installation

`@miguelfranken/mcp` is published to GitHub Packages. Point the scope at it with a token that has `read:packages` and
access to this repository:

```ini
# ~/.npmrc
@miguelfranken:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

MCP clients start the bridge from your user environment, so put this in your user-level `~/.npmrc` rather than in a
project, and make sure `GITHUB_PACKAGES_TOKEN` is set wherever your client runs. The snippets below use `npx`, which
downloads the bridge on first use. Node.js 20 or later is required.

You also need a **personal access token** for the Playwright Reporter app. Create one under **Account → Access
tokens**. It starts with `pwr_pat_`. Project API tokens (used by the reporter) don't work here.

## Configuration

| Env var | Required | |
| --- | --- | --- |
| `PW_REPORTER_URL` | yes | Base URL of your instance, e.g. `https://reporter.example.com` (a URL ending in `/api/mcp` works too) |
| `PW_REPORTER_MCP_TOKEN` | yes | Your personal access token |
| `PW_REPORTER_PROJECT` | no | Default project as `team/project`, for tools that take a project |
| `PW_REPORTER_MCP_TOOLSETS` | no | Comma-separated toolsets to enable, e.g. `core,debug` |
| `PW_REPORTER_MCP_DETECT_REPO` | no | `true` (default) sends your checkout's `git remote get-url origin`, so the instance can pick the matching project. `false` disables this. |

If a required variable is missing, the bridge prints which one to stderr and exits with code 1. If the instance
rejects the token, it prints `token rejected by <url>: check PW_REPORTER_MCP_TOKEN`.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright-reporter": {
      "command": "npx",
      "args": ["-y", "@miguelfranken/mcp"],
      "env": {
        "PW_REPORTER_URL": "https://reporter.example.com",
        "PW_REPORTER_MCP_TOKEN": "pwr_pat_..."
      }
    }
  }
}
```

### Claude Code

Claude Code supports remote servers, so the endpoint itself is simpler:
`claude mcp add --transport http playwright-reporter https://reporter.example.com/api/mcp --header "Authorization: Bearer pwr_pat_..."`.
To use the bridge instead:

```bash
claude mcp add playwright-reporter \
  --env PW_REPORTER_URL=https://reporter.example.com \
  --env PW_REPORTER_MCP_TOKEN=pwr_pat_... \
  -- npx -y @miguelfranken/mcp
```

Run this inside a checkout of the repository you want to debug. The bridge then detects the repo from its `origin`
remote.

### Cursor

`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "playwright-reporter": {
      "command": "npx",
      "args": ["-y", "@miguelfranken/mcp"],
      "env": {
        "PW_REPORTER_URL": "https://reporter.example.com",
        "PW_REPORTER_MCP_TOKEN": "pwr_pat_..."
      }
    }
  }
}
```

Cursor also supports remote servers: `{ "url": "https://reporter.example.com/api/mcp", "headers": { "Authorization": "Bearer pwr_pat_..." } }`.

## What the bridge does and doesn't do

- It connects to the instance at startup and mirrors the instance's name, instructions and capabilities. Then it
  forwards `tools/*`, `prompts/*`, `resources/*` and `completion/complete` unchanged, including pagination cursors.
- It speaks both the 2025 and the 2026-07-28 MCP protocol, on both sides, and picks the newest one each side supports.
- **It never reads or writes local files.** Its only contact with your machine is one `git remote get-url origin` at
  startup, which you can turn off with `PW_REPORTER_MCP_DETECT_REPO=false`. A test enforces that the package never
  imports `node:fs`.
- It logs to stderr only, because stdout carries the protocol.
