/**
 * Content that moved: a banner inserted near the top of a full-page capture
 * pushes every row below it down, and a pixel-by-pixel comparison then marks
 * the whole rest of the page as changed. Matching rows by their content
 * (a patience diff over row hashes) finds the rows that only moved, and
 * leaves the bands that really were added or removed.
 */
import type { DiffBand, DiffShift } from '@miguelfranken/ui/lib/review';

/** A 32-bit FNV-1a hash of each pixel row of an RGBA image. */
export function rowHashes(rgba: Uint8Array, width: number, height: number): Uint32Array {
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
  const out = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let h = 0x811c9dc5;
    const start = y * width;
    for (let x = 0; x < width; x++) {
      h ^= words[start + x];
      h = Math.imul(h, 0x01000193);
    }
    out[y] = h >>> 0;
  }
  return out;
}

/** A row repeated more often than this is layout (blank space, a flat panel), not an anchor. */
const MAX_ANCHOR_REPEATS = 4;

/**
 * For each head row, the base row it equals (-1 for none), increasing in
 * both: rare rows that occur equally often in both images anchor the match (the longest increasing chain of them),
 * and each anchor grows up and down over equal neighbours, which covers the
 * blank rows that are never unique.
 */
export function matchRows(base: Uint32Array, head: Uint32Array): Int32Array {
  const headToBase = new Int32Array(head.length).fill(-1);
  const where = (rows: Uint32Array) => {
    const m = new Map<number, number[]>();
    rows.forEach((h, i) => {
      const at = m.get(h);
      if (!at) m.set(h, [i]);
      else if (at.length <= MAX_ANCHOR_REPEATS) at.push(i);
    });
    return m;
  };
  const inBase = where(base);
  const inHead = where(head);
  // A row that occurs as often in both images (and rarely: a text line, a
  // two-pixel rule) pairs its occurrences in order; blank rows never anchor.
  const anchors: [number, number][] = [];
  for (const [hash, h] of inHead) {
    const b = inBase.get(hash);
    if (!b || b.length !== h.length || h.length > MAX_ANCHOR_REPEATS) continue;
    for (let k = 0; k < h.length; k++) anchors.push([b[k], h[k]]);
  }
  anchors.sort((a, b) => a[1] - b[1]);
  const chain = longestIncreasing(anchors);

  let lastHead = -1;
  let lastBase = -1;
  for (let k = 0; k < chain.length; k++) {
    const [b0, h0] = chain[k];
    if (h0 <= lastHead || b0 <= lastBase) continue;
    // Grow backwards over equal rows not yet matched.
    let b = b0;
    let h = h0;
    while (b - 1 > lastBase && h - 1 > lastHead && base[b - 1] === head[h - 1]) {
      b--;
      h--;
    }
    const nextHead = k + 1 < chain.length ? chain[k + 1][1] : head.length;
    const nextBase = k + 1 < chain.length ? chain[k + 1][0] : base.length;
    for (; h < head.length && b < base.length && h < nextHead && b < nextBase && base[b] === head[h]; b++, h++) headToBase[h] = b;
    lastHead = h - 1;
    lastBase = b - 1;
  }
  return headToBase;
}

/** The longest chain of pairs increasing in both coordinates (sorted by the second), O(n log n). */
function longestIncreasing(pairs: readonly [number, number][]): [number, number][] {
  const tails: number[] = [];
  const prev = new Int32Array(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i++) {
    const v = pairs[i][0];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][0] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: [number, number][] = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(pairs[i]);
  return out.reverse();
}

function bands(flags: ArrayLike<boolean>, length: number): DiffBand[] {
  const out: DiffBand[] = [];
  for (let y = 0; y < length; y++) {
    if (!flags[y]) continue;
    const start = y;
    while (y + 1 < length && flags[y + 1]) y++;
    out.push({ y: start, height: y - start + 1 });
  }
  return out;
}

/**
 * The shift between two images, when content moved: null when rows did not
 * move (the plain comparison says it all) or when too little matches for the
 * alignment to mean anything.
 */
export function detectShift(base: Uint32Array, head: Uint32Array): DiffShift | null {
  const map = matchRows(base, head);
  let matched = 0;
  let moved = 0;
  const baseMatched = new Uint8Array(base.length);
  for (let h = 0; h < head.length; h++) {
    const b = map[h];
    if (b < 0) continue;
    matched++;
    baseMatched[b] = 1;
    if (b !== h) moved++;
  }
  if (moved === 0 || matched < Math.min(base.length, head.length) * 0.5) return null;
  const headUnmatched = Array.from(map, (b) => b < 0);
  const baseUnmatched = Array.from(baseMatched, (m) => m === 0);
  return { inserted: bands(headUnmatched, head.length), removed: bands(baseUnmatched, base.length), matchedRows: matched };
}
