/**
 * The bridge against a real SDK server: the "remote" is `createMcpHandler` (what apps/web serves at /api/mcp) behind
 * an in-process fetch that enforces the bearer token, and the stdio side is reached through `serveStdio` itself over an
 * in-memory transport pair, by both a 2025-era and a 2026-07-28 client.
 */
import { Client, InMemoryTransport, ProtocolError, type FetchLike } from '@modelcontextprotocol/client';
import { createMcpHandler, legacyStatelessFallback, McpServer, Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { connectRemote, createBridgeServer, describeConnectError, isUnauthorized, mirroredCapabilities } from './bridge';
import { bridgeHeaders, type BridgeConfig } from './config';

const TOKEN = 'pwr_pat_good';
const ENDPOINT = new URL('https://reporter.test/api/mcp');
const INSTRUCTIONS = 'Use list_runs first.';

function fakeServer(): McpServer {
  const server = new McpServer(
    { name: 'playwright-reporter', title: 'Playwright Reporter', version: '1.0.0' },
    { instructions: INSTRUCTIONS, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } } },
  );
  server.registerTool(
    'echo',
    { description: 'Echoes the text back.', inputSchema: z.object({ text: z.string() }), outputSchema: z.object({ echoed: z.string() }) },
    async ({ text }) => ({ content: [{ type: 'text', text }], structuredContent: { echoed: text } }),
  );
  server.registerPrompt('greet', { description: 'Greets someone.', argsSchema: z.object({ name: z.string() }) }, ({ name }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Hello ${name}` } }],
  }));
  server.registerResource('guide', 'pwr://guide', { mimeType: 'text/markdown' }, async (uri) => ({
    contents: [{ uri: uri.href, text: '# Guide' }],
  }));
  return server;
}

/** A 2025-only server with a paginated tools/list, to prove cursors reach the remote untouched. */
function paginatedServer(): Server {
  const server = new Server({ name: 'paged', version: '1.0.0' }, { capabilities: { tools: {} } });
  const tool = (name: string) => ({ name, inputSchema: { type: 'object' as const } });
  server.setRequestHandler('tools/list', (request) =>
    request.params?.cursor === 'page-2' ? { tools: [tool('b')] } : { tools: [tool('a')], nextCursor: 'page-2' },
  );
  return server;
}

interface FakeRemote {
  fetch: FetchLike;
  requests: Request[];
  /** Flip to simulate a token revoked mid-session. */
  revoked: boolean;
}

/** Wraps an SDK HTTP handler in a fetch that checks `Authorization` the way apps/web's bearer gate does. */
function fakeRemote(handle: (request: Request) => Promise<Response>): FakeRemote {
  const remote: FakeRemote = {
    requests: [],
    revoked: false,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      remote.requests.push(request.clone());
      if (remote.revoked || request.headers.get('authorization') !== `Bearer ${TOKEN}`) {
        return Response.json({ error: 'invalid_token' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } });
      }
      return handle(request);
    },
  };
  return remote;
}

/** Configured like apps/web's handler; created once because it holds no per-connection state. */
const modernHandler = createMcpHandler(fakeServer, { legacy: 'stateless', responseMode: 'json' });
const modernRemote = () => fakeRemote(modernHandler.fetch);
/** Routes everything to the SDK's 2025 stateless leg: an instance that predates the 2026-07-28 protocol. */
const legacyRemote = (factory: () => McpServer | Server = fakeServer) => fakeRemote(legacyStatelessFallback(factory));

const config = (token = TOKEN): BridgeConfig => ({ endpoint: ENDPOINT, token, detectRepo: false });

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
});

async function connect(remote: FakeRemote, headers?: Record<string, string>): Promise<Client> {
  const client = await connectRemote(config(), { fetch: remote.fetch, headers });
  cleanup.push(() => client.close());
  return client;
}

/** A client talking to the bridge the way a stdio client would: through `serveStdio`, which negotiates the era. */
async function stdioClient(remote: Client, era: 'legacy' | 'auto'): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createBridgeServer(remote, { endpoint: ENDPOINT }), { transport: serverSide });
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { versionNegotiation: { mode: era } });
  await client.connect(clientSide);
  cleanup.push(() => client.close(), () => handle.close());
  return client;
}

describe('connectRemote', () => {
  it('negotiates the modern protocol with an instance that offers it', async () => {
    const remote = await connect(modernRemote());
    expect(remote.getProtocolEra()).toBe('modern');
  });

  it('falls back to the 2025 handshake against an instance without the modern protocol', async () => {
    const remote = await connect(legacyRemote());
    expect(remote.getProtocolEra()).toBe('legacy');
    expect(remote.getServerVersion()?.name).toBe('playwright-reporter');
  });

  it('sends the bearer token and the bridge headers on every request', async () => {
    const fake = modernRemote();
    const headers = bridgeHeaders({ ...config(), project: 'acme/api', toolsets: 'core,debug' }, 'git@github.com:acme/api.git', '1.2.3');
    await connect(fake, headers);
    expect(fake.requests.length).toBeGreaterThan(0);
    for (const request of fake.requests) {
      expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(request.headers.get('user-agent')).toBe('pw-reporter-mcp/1.2.3');
      expect(request.headers.get('x-pw-reporter-project')).toBe('acme/api');
      expect(request.headers.get('x-pw-reporter-toolsets')).toBe('core,debug');
      expect(request.headers.get('x-pw-reporter-repo')).toBe('git@github.com:acme/api.git');
    }
  });

  it('rejects a bad token with an error the CLI maps to the token message', async () => {
    const error = await connectRemote(config('pwr_pat_bad'), { fetch: modernRemote().fetch }).catch((e: unknown) => e);
    expect(isUnauthorized(error)).toBe(true);
    expect(describeConnectError(error, ENDPOINT)).toBe('token rejected by https://reporter.test/api/mcp: check PW_REPORTER_MCP_TOKEN');
  });
});

describe.each(['modern', 'legacy'] as const)('forwarding to a %s instance', (remoteEra) => {
  const makeRemote = remoteEra === 'modern' ? modernRemote : () => legacyRemote();

  describe.each(['auto', 'legacy'] as const)('from a %s stdio client', (clientEra) => {
    it('mirrors identity, instructions and capabilities', async () => {
      const client = await stdioClient(await connect(makeRemote()), clientEra);
      expect(client.getProtocolEra()).toBe(clientEra === 'auto' ? 'modern' : 'legacy');
      expect(client.getServerVersion()).toMatchObject({ name: 'playwright-reporter', version: '1.0.0' });
      expect(client.getInstructions()).toBe(INSTRUCTIONS);
      expect(client.getServerCapabilities()).toMatchObject({ tools: {}, prompts: {}, resources: {} });
    });

    it('forwards tools/list and tools/call unchanged', async () => {
      const client = await stdioClient(await connect(makeRemote()), clientEra);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(['echo']);
      expect(tools[0]).toMatchObject({ description: 'Echoes the text back.', inputSchema: { properties: { text: { type: 'string' } } } });

      const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
      expect(result).toMatchObject({ content: [{ type: 'text', text: 'hi' }], structuredContent: { echoed: 'hi' } });
      expect(result.isError).toBeFalsy();
    });

    it('forwards prompts and resources', async () => {
      const client = await stdioClient(await connect(makeRemote()), clientEra);
      expect((await client.listPrompts()).prompts.map((prompt) => prompt.name)).toEqual(['greet']);
      const prompt = await client.getPrompt({ name: 'greet', arguments: { name: 'Ada' } });
      expect(prompt.messages[0]?.content).toEqual({ type: 'text', text: 'Hello Ada' });
      expect((await client.listResources()).resources.map((resource) => resource.uri)).toEqual(['pwr://guide']);
      const read = await client.readResource({ uri: 'pwr://guide' });
      expect(read.contents[0]).toMatchObject({ uri: 'pwr://guide', text: '# Guide' });
    });

    it('turns a token revoked mid-session into a tool error, not a crash', async () => {
      const fake = makeRemote();
      const client = await stdioClient(await connect(fake), clientEra);
      fake.revoked = true;
      const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
      expect(result).toMatchObject({
        content: [{ type: 'text', text: 'token rejected by https://reporter.test/api/mcp: check PW_REPORTER_MCP_TOKEN' }],
        isError: true,
      });
      // Methods without an error slot in their result get a JSON-RPC error with the same wording.
      await expect(client.listTools()).rejects.toThrow(/token rejected by .*check PW_REPORTER_MCP_TOKEN/);
    });
  });
});

describe('createBridgeServer', () => {
  it('passes cursors through instead of aggregating pages', async () => {
    const client = await stdioClient(await connect(legacyRemote(paginatedServer)), 'legacy');
    const first = await client.request({ method: 'tools/list', params: {} });
    expect(first).toMatchObject({ tools: [{ name: 'a' }], nextCursor: 'page-2' });
    const second = await client.request({ method: 'tools/list', params: { cursor: 'page-2' } });
    expect(second.tools.map((tool) => tool.name)).toEqual(['b']);
  });

  it('only serves the capabilities the remote advertises', async () => {
    const client = await stdioClient(await connect(legacyRemote(paginatedServer)), 'legacy');
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    const error = await client.request({ method: 'prompts/list', params: {} }).catch((e: unknown) => e);
    expect(ProtocolError.isInstance(error) && error.code).toBe(-32601);
  });

  it('passes remote JSON-RPC errors through', async () => {
    const client = await stdioClient(await connect(modernRemote()), 'legacy');
    const error = await client.getPrompt({ name: 'nope' }).catch((e: unknown) => e);
    expect(ProtocolError.isInstance(error) && error.code).toBe(-32602);
    expect(String(error)).toMatch(/nope/);
  });

  it('does not promise notifications it cannot relay', () => {
    expect(
      mirroredCapabilities({ tools: { listChanged: true }, resources: { subscribe: true, listChanged: true }, logging: {}, completions: {} }),
    ).toEqual({ tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, completions: {} });
  });
});
