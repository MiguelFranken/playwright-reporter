/**
 * The forwarding core: a `Client` connected to the remote instance over Streamable HTTP, and a low-level `Server`
 * factory that answers every request by asking that client. SDK v2 has no proxy helper, and the bridge deliberately
 * holds no tool logic — tool names, schemas, descriptions and results all come from the instance, so an instance
 * upgrade never needs a bridge release.
 */
import {
  Client,
  InsufficientScopeError,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type FetchLike,
  type RequestOptions,
} from '@modelcontextprotocol/client';
import {
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type CallToolResult,
  type ServerCapabilities,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { VERSION, type BridgeConfig } from './config';

/** How the bridge identifies itself to the remote (its `clientInfo`); the stdio side mirrors the remote's identity. */
const CLIENT_INFO = { name: 'pw-reporter-mcp', version: VERSION };

export interface ConnectRemoteOptions {
  /** Extra headers for every request (`bridgeHeaders()`); `Authorization` is set by the auth provider. */
  headers?: Record<string, string>;
  /** Custom fetch, so tests can put an in-process `createMcpHandler` behind the transport. */
  fetch?: FetchLike;
}

/**
 * Connects to the remote endpoint. Connecting eagerly, before stdio is served, is what lets the stdio side mirror the
 * remote's name, capabilities and instructions exactly — and it turns a wrong URL or a revoked token into an immediate,
 * readable startup error instead of a confusing failure on the first tool call.
 */
export async function connectRemote(config: Pick<BridgeConfig, 'endpoint' | 'token'>, options: ConnectRemoteOptions = {}): Promise<Client> {
  const client = new Client(CLIENT_INFO, {
    // Speak the 2026-07-28 protocol when the instance offers it; the SDK falls back to the 2025 `initialize`
    // handshake against an older instance (verified by the era tests in bridge.test.ts).
    versionNegotiation: { mode: 'auto' },
    // The bridge must stay transparent: if the remote ever answers with `input_required` (elicitation, sampling,
    // roots), that request belongs to the real client on the other side of stdio, not to the bridge. With
    // auto-fulfilment off, `allowInputRequired` on each forwarded call hands the result back to the stdio server,
    // which relays it to a modern client or fulfils it through its legacy shim for a 2025-era one.
    inputRequired: { autoFulfill: false },
  });
  const transport = new StreamableHTTPClientTransport(config.endpoint, {
    // A static personal access token: no `onUnauthorized`, so a 401 surfaces as UnauthorizedError right away.
    authProvider: { token: async () => config.token },
    requestInit: { headers: options.headers ?? {} },
    fetch: options.fetch,
  });
  await client.connect(transport);
  return client;
}

/** True when the remote rejected the token: the transport's UnauthorizedError, or a raw HTTP 401. */
export function isUnauthorized(error: unknown): boolean {
  return UnauthorizedError.isInstance(error) || (SdkHttpError.isInstance(error) && error.status === 401);
}

/** The single wording for a rejected token, shared by the startup path and tool calls. */
export function tokenRejectedMessage(endpoint: URL | string): string {
  return `token rejected by ${String(endpoint)}: check PW_REPORTER_MCP_TOKEN`;
}

/**
 * A one-line, actionable explanation for a failed startup connect. Covers the cases a user can fix from their
 * config; anything else falls back to the SDK's message.
 */
export function describeConnectError(error: unknown, endpoint: URL | string): string {
  if (isUnauthorized(error)) return tokenRejectedMessage(endpoint);
  if (InsufficientScopeError.isInstance(error)) {
    return `token rejected by ${String(endpoint)}: it lacks the required scope, create a token with read access`;
  }
  if (SdkHttpError.isInstance(error) && error.status === 404) {
    return `no MCP endpoint at ${String(endpoint)} (HTTP 404): check PW_REPORTER_URL, and that MCP is enabled on the instance`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `could not connect to ${String(endpoint)}: ${message}`;
}

/**
 * The capabilities the stdio side advertises: the remote's, restricted to what the bridge forwards. `listChanged` and
 * `subscribe` are forced off because the bridge relays requests only, not server-initiated notifications (the
 * instance advertises neither anyway). Other capabilities (logging, tasks, extensions) are dropped rather than
 * promised without a handler behind them.
 */
export function mirroredCapabilities(remote: ServerCapabilities | undefined): ServerCapabilities {
  const capabilities: ServerCapabilities = {};
  if (remote?.tools) capabilities.tools = { ...remote.tools, listChanged: false };
  if (remote?.prompts) capabilities.prompts = { ...remote.prompts, listChanged: false };
  if (remote?.resources) capabilities.resources = { ...remote.resources, listChanged: false, subscribe: false };
  if (remote?.completions) capabilities.completions = { ...remote.completions };
  return capabilities;
}

export interface BridgeServerOptions {
  /** Named in the "token rejected" message; defaults to a generic phrase when the caller doesn't know the URL. */
  endpoint?: URL | string;
}

type ForwardedMethod =
  | 'tools/list'
  | 'tools/call'
  | 'prompts/list'
  | 'prompts/get'
  | 'resources/list'
  | 'resources/templates/list'
  | 'resources/read'
  | 'completion/complete';

/** The methods whose results may be `input_required` on the 2026-07-28 protocol. */
const MULTI_ROUND_TRIP = new Set<ForwardedMethod>(['tools/call', 'prompts/get', 'resources/read']);

/**
 * Builds the stdio-side server for one connection. Its identity, capabilities and instructions are the remote's, and
 * each request is re-issued on the remote client with `client.request()` — never the convenience methods like
 * `listTools()`, which aggregate every page themselves and would swallow the caller's cursor.
 *
 * Handlers are registered only for capabilities the remote advertises, so a client asking for, say, prompts on an
 * instance without them gets the SDK's standard "method not found".
 */
export function createBridgeServer(remote: Client, options: BridgeServerOptions = {}): Server {
  const capabilities = mirroredCapabilities(remote.getServerCapabilities());
  const server = new Server(remote.getServerVersion() ?? { name: 'playwright-reporter', version: 'unknown' }, {
    capabilities,
    instructions: remote.getInstructions(),
  });
  const endpoint = options.endpoint ?? 'the Playwright Reporter instance';

  /**
   * Output schemas as the remote advertised them, keyed by tool name. A 2025-era stdio client needs non-object
   * structured results wrapped the way the (then wrapped) schema promises; `projectCallToolResult` does that, but only
   * if it knows the schema. Our instance only uses object schemas today, which makes this a no-op in practice.
   */
  const outputSchemas = new Map<string, Record<string, unknown> | undefined>();

  const send = <M extends ForwardedMethod>(method: M, params: object | undefined, ctx: ServerContext) =>
    remote.request({ method, params: forwardedParams(params, ctx) }, requestOptions(method, ctx));

  /** Remote JSON-RPC errors pass through unchanged (same code and message); a 401 gets the readable wording. */
  const forward = async <M extends ForwardedMethod>(method: M, params: object | undefined, ctx: ServerContext) => {
    try {
      return await send(method, params, ctx);
    } catch (error) {
      if (isUnauthorized(error)) throw new ProtocolError(ProtocolErrorCode.InternalError, tokenRejectedMessage(endpoint));
      throw error;
    }
  };

  if (capabilities.tools) {
    server.setRequestHandler('tools/list', async (request, ctx) => {
      const result = await forward('tools/list', request.params, ctx);
      for (const tool of result.tools) outputSchemas.set(tool.name, tool.outputSchema);
      return result;
    });
    server.setRequestHandler('tools/call', async (request, ctx) => {
      let result;
      try {
        result = await send('tools/call', request.params, ctx);
      } catch (error) {
        // A revoked or expired token mid-session is something the model should be able to tell the user about, so it
        // becomes a tool result rather than a protocol error that clients tend to show as a generic failure.
        if (isUnauthorized(error)) {
          return { content: [{ type: 'text', text: tokenRejectedMessage(endpoint) }], isError: true } satisfies CallToolResult;
        }
        throw error;
      }
      if (!('content' in result)) return result; // input_required: relayed untouched
      return server.projectCallToolResult(result as CallToolResult, outputSchemas.get(request.params.name));
    });
  }
  if (capabilities.prompts) {
    server.setRequestHandler('prompts/list', (request, ctx) => forward('prompts/list', request.params, ctx));
    server.setRequestHandler('prompts/get', (request, ctx) => forward('prompts/get', request.params, ctx));
  }
  if (capabilities.resources) {
    server.setRequestHandler('resources/list', (request, ctx) => forward('resources/list', request.params, ctx));
    server.setRequestHandler('resources/templates/list', (request, ctx) => forward('resources/templates/list', request.params, ctx));
    server.setRequestHandler('resources/read', (request, ctx) => forward('resources/read', request.params, ctx));
  }
  if (capabilities.completions) {
    server.setRequestHandler('completion/complete', (request, ctx) => forward('completion/complete', request.params, ctx));
  }
  return server;
}

/**
 * The params to send upstream. The server SDK lifts protocol-level fields out of what a handler sees (the reserved
 * `io.modelcontextprotocol/*` envelope keys, `inputResponses`, `requestState`); the envelope must stay lifted because
 * the remote client writes its own, but the multi-round-trip fields belong to the remote and are put back.
 * `progressToken` is stripped: it names a token of the stdio connection, so progress is relayed instead (see
 * `requestOptions`).
 */
function forwardedParams(params: object | undefined, ctx: ServerContext): Record<string, unknown> {
  const { _meta: _dropped, ...rest } = (params ?? {}) as Record<string, unknown>;
  const forwarded: Record<string, unknown> = { ...rest };
  const { progressToken: _progress, ...meta } = ctx.mcpReq._meta ?? {};
  if (Object.keys(meta).length > 0) forwarded._meta = meta;
  if (ctx.mcpReq.inputResponses) forwarded.inputResponses = ctx.mcpReq.inputResponses;
  const state = ctx.mcpReq.requestState();
  if (typeof state === 'string') forwarded.requestState = state;
  return forwarded;
}

/** Cancellation and progress flow back to the stdio client; `input_required` results are handed back, not fulfilled. */
function requestOptions(method: ForwardedMethod, ctx: ServerContext): RequestOptions {
  const options: RequestOptions = { signal: ctx.mcpReq.signal };
  if (MULTI_ROUND_TRIP.has(method)) options.allowInputRequired = true;
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken !== undefined) {
    options.resetTimeoutOnProgress = true;
    options.onprogress = (progress) => {
      void ctx.mcpReq.notify({ method: 'notifications/progress', params: { ...progress, progressToken } }).catch(() => {});
    };
  }
  return options;
}
