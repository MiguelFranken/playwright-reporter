import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { ingestContract } from './contract';

const routes = Object.entries(ingestContract).flatMap(([group, procedures]) =>
  Object.entries(procedures).map(([name, procedure]) => {
    const meta = getOpenAPIMeta(procedure);
    return `${group}.${name}: ${meta?.method} ${meta?.path}`;
  }),
);

describe('ingestContract', () => {
  // The paths released reporters call. Changing one breaks them.
  it('keeps the wire paths of the ingest API', () => {
    expect(routes).toEqual([
      'runs.start: POST /runs',
      'runs.events: POST /runs/{runId}/events',
      'runs.heartbeat: POST /runs/{runId}/heartbeat',
      'runs.finish: POST /runs/{runId}/finish',
      'attachments.uploadUrls: POST /runs/{runId}/attachments/upload-urls',
      'attachments.complete: POST /runs/{runId}/attachments/{attachmentId}/complete',
    ]);
  });
});
