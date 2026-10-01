import { describe, expect, it } from 'vitest';
import { liveTranscript } from './live-transcript';

describe('liveTranscript', () => {
  it('grows an utterance through deltas and replaces it with its final text', () => {
    const live = liveTranscript();
    live.add({ type: 'transcript-delta', id: 'a', delta: 'make the' });
    live.add({ type: 'transcript-delta', id: 'a', delta: ' button' });
    expect(live.text).toBe('make the button');
    live.add({ type: 'transcript-final', id: 'a', text: 'Make the button larger.' });
    live.add({ type: 'transcript-partial', id: 'b', text: 'and blue' });
    expect(live.text).toBe('Make the button larger. and blue');
  });

  it('keeps unnamed utterances apart once one is final', () => {
    const live = liveTranscript();
    live.add({ type: 'transcript-partial', text: 'one' });
    live.add({ type: 'transcript-final', text: 'One.' });
    live.add({ type: 'transcript-partial', text: 'two' });
    expect(live.text).toBe('One. two');
  });

  it('ignores everything that is not a transcript', () => {
    const live = liveTranscript();
    expect(live.add({ type: 'raw', rawValue: {} })).toBe(false);
    expect(live.text).toBe('');
  });
});
