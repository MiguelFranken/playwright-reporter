import { ORPCError } from '@orpc/server';
import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/mcp/errors';
import { asProblemResponse, fromToolError, problemBody, statusOf } from './errors';

describe('problem details', () => {
  it('keeps the tool error code and maps it to an HTTP status', () => {
    const error = fromToolError(new ToolError('AMBIGUOUS', 'Several tests match "login".', 'Pass file or browser.', { candidates: [{ id: 'a' }] }));
    expect(problemBody(error)).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'AMBIGUOUS',
      detail: 'Several tests match "login".',
      hint: 'Pass file or browser.',
      details: { candidates: [{ id: 'a' }] },
    });
  });

  it('names REST endpoints instead of MCP tools in messages and hints', () => {
    const error = fromToolError(new ToolError('NOT_FOUND', 'Result x not found in acme/web.', 'Call list_run_results to find results of a run.'));
    expect(problemBody(error).hint).toBe('Call GET …/runs/{run}/results to find results of a run.');
  });

  it('reports oRPC input validation issues as details of a 400', () => {
    const error = new ORPCError('BAD_REQUEST', { message: 'Input validation failed', data: { issues: [{ path: ['limit'] }] } });
    expect(problemBody(error)).toMatchObject({ status: 400, code: 'BAD_REQUEST', details: [{ path: ['limit'] }], hint: null });
  });

  it('maps every MCP error code, and unknown codes to 500', () => {
    expect(statusOf('NOT_FOUND')).toBe(404);
    expect(statusOf('INVALID_ARGUMENT')).toBe(400);
    expect(statusOf('ARTIFACT_EXPIRED')).toBe(410);
    expect(statusOf('RATE_LIMITED')).toBe(429);
    expect(statusOf('SOMETHING_ELSE')).toBe(500);
  });

  it('gives error responses the problem+json media type and leaves successes alone', () => {
    expect(asProblemResponse(Response.json({}, { status: 404 })).headers.get('content-type')).toBe('application/problem+json');
    expect(asProblemResponse(Response.json({})).headers.get('content-type')).toBe('application/json');
  });
});
