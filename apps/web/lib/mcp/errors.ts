/**
 * Tool errors are ordinary tool results with `isError: true`, so the model can
 * read them and correct course. Every error carries a code, a one-line reason
 * and, where one exists, the call that gets the model unstuck.
 */
export type ToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PROJECT_REQUIRED'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'ARTIFACT_EXPIRED'
  | 'ARTIFACT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class ToolError extends Error {
  constructor(
    public code: ToolErrorCode,
    message: string,
    public hint?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export const invalid = (message: string, hint?: string) => new ToolError('INVALID_ARGUMENT', message, hint);

/** Missing *or* not visible: the two are never told apart, like the app's 404s. */
export const notFound = (message: string, hint?: string) => new ToolError('NOT_FOUND', message, hint);
