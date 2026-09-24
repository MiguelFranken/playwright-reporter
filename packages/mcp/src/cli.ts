#!/usr/bin/env node
/**
 * `pw-reporter-mcp`: a stdio MCP server that forwards every request to a Playwright Reporter instance's Streamable
 * HTTP endpoint, for MCP clients that can only launch local processes. Stdout is the protocol channel, so everything
 * human-readable goes to stderr.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { connectRemote, createBridgeServer, describeConnectError } from './bridge';
import { bridgeHeaders, ConfigError, detectRepo, loadConfig, VERSION, type BridgeConfig } from './config';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let config: BridgeConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    throw error;
  }

  const repo = config.detectRepo ? await detectRepo(process.cwd()) : undefined;
  const remote = await connectRemote(config, { headers: bridgeHeaders(config, repo) }).catch((error: unknown) =>
    fail(`pw-reporter-mcp: ${describeConnectError(error, config.endpoint)}`),
  );
  process.stderr.write(`pw-reporter-mcp ${VERSION}: connected to ${config.endpoint.href} (${remote.getProtocolEra()} protocol)\n`);

  const stdio = serveStdio(() => createBridgeServer(remote, { endpoint: config.endpoint }), {
    onerror: (error) => process.stderr.write(`pw-reporter-mcp: ${error.message}\n`),
  });

  // The stdio transport closes itself when the client closes stdin; the remote client's HTTP connection would still
  // keep the process alive, so shut both down explicitly and exit.
  let closing = false;
  const shutdown = async (code: number) => {
    if (closing) return;
    closing = true;
    await Promise.allSettled([stdio.close(), remote.close()]);
    process.exit(code);
  };
  process.stdin.once('end', () => void shutdown(0));
  process.stdin.once('close', () => void shutdown(0));
  process.once('SIGINT', () => void shutdown(0));
  process.once('SIGTERM', () => void shutdown(0));
}

main().catch((error: unknown) => fail(`pw-reporter-mcp: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`));
