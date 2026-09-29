import { describe, expect, it } from 'vitest';
import { attemptEndEventSchema, checkpointSchema, classifyAttachment, legacyCheckpoints, parseReviewAttachmentName, runStartSchema } from './index';

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

describe('review checkpoints', () => {
  it('parses review attachment names', () => {
    expect(parseReviewAttachmentName('review:coupon-applied:desktop')).toEqual({ name: 'coupon-applied', variant: 'desktop', thumbnail: false });
    expect(parseReviewAttachmentName('review:coupon-applied:mobile:thumb')).toEqual({ name: 'coupon-applied', variant: 'mobile', thumbnail: true });
    expect(parseReviewAttachmentName('review:solo')).toEqual({ name: 'solo', variant: 'default', thumbnail: false });
    expect(parseReviewAttachmentName('review:a:b:mobile')).toEqual({ name: 'a:b', variant: 'mobile', thumbnail: false });
    expect(parseReviewAttachmentName('screenshot')).toBeNull();
    expect(parseReviewAttachmentName('review:')).toBeNull();
  });

  it('groups legacy review images into checkpoints in attachment order', () => {
    const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    const cps = legacyCheckpoints([
      { id: id(1), name: 'review:ready:desktop', contentType: 'image/png' },
      { id: id(2), name: 'review:ready:mobile', contentType: 'image/png' },
      { id: id(3), name: 'screenshot', contentType: 'image/png' },
      { id: id(4), name: 'review:done:desktop', contentType: 'image/png' },
      { id: id(5), name: 'review:done:desktop:thumb', contentType: 'image/jpeg' },
      { id: id(6), name: 'review:notes:desktop', contentType: 'text/plain' },
    ]);
    expect(cps).toEqual([
      { name: 'ready', sequence: 0, variants: [{ variant: 'desktop', attachmentId: id(1) }, { variant: 'mobile', attachmentId: id(2) }] },
      { name: 'done', sequence: 1, variants: [{ variant: 'desktop', attachmentId: id(4), thumbnailAttachmentId: id(5) }] },
    ]);
    expect(cps.every((c) => checkpointSchema.safeParse(c).success)).toBe(true);
  });

  it('keeps attempt ends without checkpoints valid', () => {
    const base = {
      seq: 1, type: 'attempt.end', testKey: 'k', retry: 0, status: 'passed', durationMs: 10,
      startedAt: new Date().toISOString(), workerIndex: 0, parallelIndex: 0, errors: [], steps: [],
      stdout: '', stderr: '', annotations: [], attachments: [], outcome: 'expected', isFinal: true,
    };
    expect(attemptEndEventSchema.safeParse(base).success).toBe(true);
    expect(
      attemptEndEventSchema.safeParse({
        ...base,
        checkpoints: [{ name: 'x', sequence: 0, variants: [{ variant: 'desktop', attachmentId: '00000000-0000-4000-8000-000000000001' }] }],
      }).success,
    ).toBe(true);
  });
});
