import { describe, expect, test } from 'vitest';
import { mergeCheckpointOrder } from './library-order';

describe('mergeCheckpointOrder', () => {
  test('keeps the newest run’s order', () => {
    expect(mergeCheckpointOrder([['cart', 'payment', 'done']])).toEqual(['cart', 'payment', 'done']);
  });

  test('slots a checkpoint only an older run has after the one it followed there', () => {
    // The newest run failed after the cart; the older one got through payment.
    expect(mergeCheckpointOrder([['cart'], ['cart', 'payment', 'done']])).toEqual(['cart', 'payment', 'done']);
    expect(mergeCheckpointOrder([['cart', 'done'], ['cart', 'payment', 'done']])).toEqual(['cart', 'payment', 'done']);
  });

  test('puts a checkpoint before the one it preceded when nothing before it is placed', () => {
    expect(mergeCheckpointOrder([['payment'], ['landing', 'payment']])).toEqual(['landing', 'payment']);
  });

  test('appends what shares nothing with the placed checkpoints', () => {
    expect(mergeCheckpointOrder([['a'], ['x', 'y']])).toEqual(['a', 'x', 'y']);
  });

  test('leaves out what is not kept', () => {
    expect(mergeCheckpointOrder([['a', 'c'], ['a', 'b', 'c']], new Set(['a', 'c']))).toEqual(['a', 'c']);
  });
});
