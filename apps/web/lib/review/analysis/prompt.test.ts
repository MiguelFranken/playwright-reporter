import { NoObjectGeneratedError } from 'ai';
import { describe, expect, test } from 'vitest';
import type { VisualDiffRegion } from '@miguelfranken/ui/lib/visual-diff';
import { boxToRect, modelErrorMessage, validateBoxes } from './prompt';

const region: VisualDiffRegion = { id: 'r200-100-60-20', label: 'D1', kind: 'change', headRect: { x: 200, y: 100, width: 60, height: 20 }, baseRect: { x: 200, y: 100, width: 60, height: 20 }, rawChangedPixels: 900, ignore: 'none', ignoredBy: [] };
const crop = { x: 152, y: 52, width: 156, height: 116 };

describe('boxToRect', () => {
  test('maps thousandths of the crop onto image pixels, whichever way the corners come', () => {
    expect(boxToRect({ x0: 0, y0: 0, x1: 1000, y1: 1000 }, crop)).toEqual(crop);
    expect(boxToRect({ x0: 500, y0: 500, x1: 250, y1: 250 }, crop)).toEqual({ x: 152 + 39, y: 52 + 29, width: 39, height: 29 });
    expect(boxToRect({ x0: 300, y0: 300, x1: 300, y1: 300 }, crop)).toBeNull();
  });
});

describe('validateBoxes', () => {
  test('keeps tight boxes on the change, drops the rest and says why', () => {
    // The name: roughly the region itself, in crop thousandths.
    const tight = { x0: 308, y0: 414, x1: 692, y1: 586 };
    const whole = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const beside = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const { rects, rejected } = validateBoxes([tight, whole, beside], crop, region);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 200, y: 100 });
    expect(rects[0].width).toBeGreaterThanOrEqual(60);
    expect(rects[0].width).toBeLessThanOrEqual(62);
    expect(rejected).toEqual(['a box covering most of the crop', 'a box that does not touch the change']);
  });

  test('overlapping boxes become one', () => {
    const a = { x0: 308, y0: 414, x1: 500, y1: 586 };
    const b = { x0: 450, y0: 414, x1: 692, y1: 586 };
    expect(validateBoxes([a, b], crop, region).rects).toHaveLength(1);
  });
});

describe('modelErrorMessage', () => {
  const usage = { inputTokens: 9000, outputTokens: 1500, totalTokens: 10500, outputTokenDetails: { reasoningTokens: 1100 } } as ConstructorParameters<typeof NoObjectGeneratedError>[0]['usage'];
  const response = { id: 'r', timestamp: new Date(0), modelId: 'google/gemini-3.8-flash' };

  test('says an answer was cut off at the output limit, and how much of it was reasoning', () => {
    const error = new NoObjectGeneratedError({ message: 'No object generated: could not parse the response.', text: '{"summary":"The na', response, usage, finishReason: 'length' });
    expect(modelErrorMessage(error)).toBe("The model's answer was cut off at the output limit (1500 output tokens, 1100 of them reasoning) before it was complete.");
  });

  test('keeps the SDK’s message for any other failure, with the finish reason', () => {
    const error = new NoObjectGeneratedError({ message: 'No object generated: response did not match schema.', response, usage, finishReason: 'stop' });
    expect(modelErrorMessage(error)).toBe('The model call failed: No object generated: response did not match schema. Finish reason: stop (1500 output tokens, 1100 of them reasoning).');
    expect(modelErrorMessage(new Error('gateway timeout'))).toBe('The model call failed: gateway timeout');
  });
});
