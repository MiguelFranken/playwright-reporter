import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TestResult, TestStep } from '@playwright/test/reporter';
import type { AttachmentRef } from '@miguelfranken/protocol';
import { buildCheckpoints, isCheckpointRecord } from './checkpoints';
import { CHECKPOINT_CONTENT_TYPE, pngSize, readCheckpoints } from './review';

type Att = TestResult['attachments'][number];

/** The smallest header `pngSize` reads: signature, IHDR, width, height. */
function png(width: number, height: number) {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function step(title: string, category: string, children: TestStep[] = [], attachments: Att[] = []): TestStep {
  return { title, category, steps: children, attachments, startTime: new Date('2026-09-29T10:00:05Z'), duration: 1 } as unknown as TestStep;
}

function refsFor(atts: Att[]) {
  return new Map(atts.map((a, i) => [a, { id: `00000000-0000-4000-8000-00000000000${i}`, name: a.name, contentType: a.contentType } as AttachmentRef]));
}

describe('buildCheckpoints', () => {
  it('resolves a record to attachment ids and fills in the step path', () => {
    const desktop: Att = { name: 'review:ready:desktop', contentType: 'image/png', path: '/tmp/x.png' };
    const thumb: Att = { name: 'review:ready:desktop:thumb', contentType: 'image/jpeg', path: '/tmp/x.jpg' };
    const record: Att = {
      name: 'pw-reporter:checkpoint:ready',
      contentType: CHECKPOINT_CONTENT_TYPE,
      body: Buffer.from(JSON.stringify({ v: 1, name: 'ready', sequence: 0, title: 'Ready', variants: [{ variant: 'desktop', attachment: desktop.name, thumbnail: thumb.name, sha256: 'a'.repeat(64) }] })),
    };
    const steps = [step('Book a workshop', 'test.step', [step('Review checkpoint: Ready', 'test.step', [step('Attach "review:ready:desktop"', 'test.attach', [], [desktop])])])];
    const refs = refsFor([desktop, thumb]);
    const [cp] = buildCheckpoints({ attachments: [desktop, thumb, record], steps }, refs);
    expect(cp).toMatchObject({
      name: 'ready',
      title: 'Ready',
      sequence: 0,
      stepPath: ['Book a workshop'],
      variants: [{ variant: 'desktop', attachmentId: refs.get(desktop)!.id, thumbnailAttachmentId: refs.get(thumb)!.id, sha256: 'a'.repeat(64) }],
    });
    expect(isCheckpointRecord(record)).toBe(true);
  });

  it('hashes legacy review images and takes their time from the step', () => {
    const body = png(2560, 1440);
    const a: Att = { name: 'review:done:desktop', contentType: 'image/png', body };
    const b: Att = { name: 'screenshot', contentType: 'image/png', body };
    const steps = [step('Pay', 'test.step', [step('Attach', 'test.attach', [], [a])])];
    const [cp, ...rest] = buildCheckpoints({ attachments: [a, b], steps }, refsFor([a, b]));
    expect(rest).toEqual([]);
    expect(cp.stepPath).toEqual(['Pay']);
    expect(cp.capturedAt).toBe('2026-09-29T10:00:05.000Z');
    expect(cp.variants[0]).toMatchObject({ width: 2560, height: 1440, sha256: createHash('sha256').update(body).digest('hex') });
  });

  it('drops a record whose images were not uploaded', () => {
    const record: Att = {
      name: 'pw-reporter:checkpoint:x',
      contentType: CHECKPOINT_CONTENT_TYPE,
      body: Buffer.from(JSON.stringify({ v: 1, name: 'x', sequence: 0, variants: [{ variant: 'desktop', attachment: 'review:x:desktop' }] })),
    };
    expect(buildCheckpoints({ attachments: [record], steps: [] }, new Map())).toEqual([]);
  });
});

describe('review helpers', () => {
  it('reads a PNG size', () => {
    expect(pngSize(png(780, 1688))).toEqual({ width: 780, height: 1688 });
    expect(pngSize(Buffer.from('not a png'))).toBeNull();
  });

  it('reads checkpoint records in order and skips malformed ones', () => {
    const rec = (sequence: number) => ({ name: 'r', contentType: CHECKPOINT_CONTENT_TYPE, body: Buffer.from(JSON.stringify({ v: 1, name: `c${sequence}`, sequence, variants: [] })) });
    const records = readCheckpoints({ attachments: [rec(1), { name: 'bad', contentType: CHECKPOINT_CONTENT_TYPE, body: Buffer.from('{') }, rec(0)] });
    expect(records.map((r) => r.name)).toEqual(['c0', 'c1']);
  });
});
