import { describe, expect, it } from 'vitest';
import { attemptEndEventSchema, classifyAttachment, runStartSchema } from './index';

describe('protocol', () => {
  it('classifies attachments', () => {
    expect(classifyAttachment('screenshot', 'image/png')).toBe('screenshot');
    expect(classifyAttachment('video', 'video/webm')).toBe('video');
    expect(classifyAttachment('trace', 'application/zip')).toBe('trace');
    expect(classifyAttachment('home-expected.png', 'image/png')).toBe('image');
    expect(classifyAttachment('log', 'text/plain')).toBe('text');
    expect(classifyAttachment('blob', 'application/octet-stream')).toBe('other');
  });

  it('rejects malformed run start', () => {
    expect(runStartSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a minimal attempt end', () => {
    const r = attemptEndEventSchema.safeParse({
      seq: 1, type: 'attempt.end', testKey: 'k', retry: 0, status: 'passed', durationMs: 10,
      startedAt: new Date().toISOString(), workerIndex: 0, parallelIndex: 0, errors: [], steps: [],
      stdout: '', stderr: '', annotations: [], attachments: [], outcome: 'expected', isFinal: true,
    });
    expect(r.success).toBe(true);
  });
});
