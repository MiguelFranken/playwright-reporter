import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createORPCClient, ORPCError } from '@orpc/client';
import { RetryLinkPlugin, TimeoutLinkPlugin, type RetryLinkPluginContext } from '@orpc/client/plugins';
import type { ContractRouterClient, InferContractRouterInputs } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import { PROTOCOL_HEADER, PROTOCOL_VERSION, type UploadInstruction } from '@miguelfranken/protocol';
import { INGEST_PREFIX, ingestContract, type IngestContract } from '@miguelfranken/protocol/contract';
import type { ResolvedOptions } from './types';

/** A non-2xx answer from the server, with its status. */
export class HttpError extends ORPCError<string, { status: number }> {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`HTTP_${status}`, { message, data: { status } });
  }
}

/** What each call can say about its own retries and timeout. */
export interface CallContext extends RetryLinkPluginContext {
  /** Aborts the call, retries included, after this long. */
  timeoutMs?: number;
}

/** The ingest API, typed from its contract. */
export type IngestApi = ContractRouterClient<IngestContract, CallContext>;
type Inputs = InferContractRouterInputs<IngestContract>;

/** JSON bodies above this are gzipped; the server inflates them. */
const GZIP_THRESHOLD = 32 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (retry: number) => Math.min(8000, 500 * 2 ** retry);

function isRetryable(err: unknown) {
  if (!(err instanceof HttpError)) return true; // network error
  return err.status >= 500 || err.status === 408 || err.status === 429;
}

/** The server's error text: `{ error }` from the ingest routes, or whatever a proxy in front of them sent. */
function errorDetail(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return body === undefined ? '' : JSON.stringify(body);
}

function gzipLargeBody(init: RequestInit): RequestInit {
  if (typeof init.body !== 'string' || init.body.length <= GZIP_THRESHOLD) return init;
  const headers = new Headers(init.headers);
  headers.set('content-encoding', 'gzip');
  return { ...init, headers, body: new Blob([new Uint8Array(gzipSync(init.body))]) };
}

export function createIngestApi(opts: ResolvedOptions, log: (msg: string) => void): IngestApi {
  const link = new OpenAPILink<CallContext>(ingestContract, {
    origin: opts.serverUrl,
    url: INGEST_PREFIX,
    headers: {
      authorization: `Bearer ${opts.token}`,
      [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    },
    // Follow redirects like a plain fetch (an http:// server URL answered with
    // a 308 to https), where the link would hand back the 3xx itself.
    fetch: (url, init) => globalThis.fetch(url, { ...gzipLargeBody(init), redirect: 'follow' }),
    customErrorResponseBodyDecoder: (body, response) =>
      new HttpError(response.status, `${response.status}: ${errorDetail(body).slice(0, 500)}`),
    plugins: [
      new RetryLinkPlugin<CallContext>({
        default: {
          retry: opts.maxRetries,
          shouldRetry: ({ error }) => isRetryable(error),
          retryDelay: ({ attempt }) => backoff(attempt - 1),
          onRetry: ({ path, error, attempt }) => {
            log(`request ${path.join('.')} failed (${(error as Error).message}); retrying in ${backoff(attempt - 1)}ms`);
          },
        },
      }),
      new TimeoutLinkPlugin<CallContext>({ timeout: ({ context }) => context.timeoutMs }),
    ],
  });
  return createORPCClient(link);
}

/**
 * The reporter's side of the ingest API. Calls go through the typed client;
 * this class adds the per-call policy (the heartbeat's single attempt) and the
 * attachment upload, which goes to whatever URL the server handed out.
 */
export class IngestClient {
  readonly api: IngestApi;

  constructor(
    private readonly opts: ResolvedOptions,
    log: (msg: string) => void,
  ) {
    this.api = createIngestApi(opts, log);
  }

  startRun(body: Inputs['runs']['start']) {
    return this.api.runs.start(body);
  }

  sendEvents(runId: string, body: Omit<Inputs['runs']['events'], 'runId'>) {
    return this.api.runs.events({ runId, ...body });
  }

  uploadUrls(runId: string, attachmentIds: string[]) {
    return this.api.attachments.uploadUrls({ runId, attachmentIds });
  }

  completeUpload(runId: string, attachmentId: string, size: number) {
    return this.api.attachments.complete({ runId, attachmentId, size });
  }

  finishRun(runId: string, body: Omit<Inputs['runs']['finish'], 'runId'>) {
    return this.api.runs.finish({ runId, ...body });
  }

  /** One attempt, bounded: the next beat is the retry. */
  heartbeat(runId: string, body: Omit<Inputs['runs']['heartbeat'], 'runId'>) {
    return this.api.runs.heartbeat({ runId, ...body }, { context: { retry: 0, timeoutMs: 10_000 } });
  }

  /**
   * Not part of the contract: the target is the app's proxy route or a
   * presigned storage URL, as the upload instruction says.
   */
  async upload(
    instruction: UploadInstruction,
    source: { path?: string; body?: Buffer },
    contentType: string,
  ): Promise<number> {
    const data = source.body ?? (source.path ? await readFile(source.path) : undefined);
    if (!data) throw new Error('attachment has neither path nor body');
    const headers: Record<string, string> = { 'content-type': contentType, ...instruction.headers };
    if (instruction.strategy === 'proxy') headers.authorization = `Bearer ${this.opts.token}`;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(instruction.url, {
          method: instruction.method,
          headers,
          body: new Blob([new Uint8Array(data)]),
        });
        if (!res.ok) throw new HttpError(res.status, `upload failed with ${res.status}`);
        return data.byteLength;
      } catch (err) {
        if (!isRetryable(err) || attempt >= this.opts.maxRetries) throw err;
        await sleep(backoff(attempt));
      }
    }
  }
}
