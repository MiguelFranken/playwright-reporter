import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import {
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  type EventBatch,
  type EventBatchResponse,
  type RunFinish,
  type RunFinishResponse,
  type RunHeartbeat,
  type RunHeartbeatResponse,
  type RunStart,
  type RunStartResponse,
  type UploadInstruction,
  type UploadUrlsResponse,
} from '@miguelfranken/protocol';
import type { ResolvedOptions } from './types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown) {
  if (!(err instanceof HttpError)) return true; // network error
  return err.status >= 500 || err.status === 408 || err.status === 429;
}

export class IngestClient {
  constructor(
    private readonly opts: ResolvedOptions,
    private readonly log: (msg: string) => void,
  ) {}

  private async request<T>(
    path: string,
    body: unknown,
    attempt = 0,
    { maxRetries = this.opts.maxRetries, timeoutMs }: { maxRetries?: number; timeoutMs?: number } = {},
  ): Promise<T> {
    const url = `${this.opts.serverUrl}${path}`;
    const json = JSON.stringify(body);
    let payload: BodyInit = json;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.opts.token}`,
      [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    };
    if (json.length > 32 * 1024) {
      payload = new Blob([new Uint8Array(gzipSync(json))]);
      headers['content-encoding'] = 'gzip';
    }
    try {
      const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
      const res = await fetch(url, { method: 'POST', headers, body: payload, signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new HttpError(res.status, `${res.status} ${path}: ${text.slice(0, 500)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (isRetryable(err) && attempt < maxRetries) {
        const delay = Math.min(8000, 500 * 2 ** attempt);
        this.log(`request ${path} failed (${(err as Error).message}); retrying in ${delay}ms`);
        await sleep(delay);
        return this.request<T>(path, body, attempt + 1, { maxRetries, timeoutMs });
      }
      throw err;
    }
  }

  startRun(body: RunStart) {
    return this.request<RunStartResponse>('/api/ingest/runs', body);
  }

  sendEvents(runId: string, body: EventBatch) {
    return this.request<EventBatchResponse>(`/api/ingest/runs/${runId}/events`, body);
  }

  uploadUrls(runId: string, attachmentIds: string[]) {
    return this.request<UploadUrlsResponse>(`/api/ingest/runs/${runId}/attachments/upload-urls`, { attachmentIds });
  }

  completeUpload(runId: string, attachmentId: string, size: number) {
    return this.request<{ ok: boolean }>(`/api/ingest/runs/${runId}/attachments/${attachmentId}/complete`, { size });
  }

  finishRun(runId: string, body: RunFinish) {
    return this.request<RunFinishResponse>(`/api/ingest/runs/${runId}/finish`, body);
  }

  /** One attempt, bounded: the next beat is the retry. */
  heartbeat(runId: string, body: RunHeartbeat) {
    return this.request<RunHeartbeatResponse>(`/api/ingest/runs/${runId}/heartbeat`, body, 0, { maxRetries: 0, timeoutMs: 10_000 });
  }

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
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }
}
