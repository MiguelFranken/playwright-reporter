import type { TranscriptionStreamPart } from 'ai';

/**
 * Folds a streaming transcription's parts into the text said so far. Each
 * utterance grows through deltas or is replaced by partials until it is
 * final; utterances without an id follow one another, a final ending one.
 */
export function liveTranscript() {
  const utterances = new Map<string, string>();
  let unnamed = 0;

  return {
    add(part: TranscriptionStreamPart): boolean {
      if (part.type !== 'transcript-delta' && part.type !== 'transcript-partial' && part.type !== 'transcript-final') return false;
      const key = part.id ?? `#${unnamed}`;
      if (part.type === 'transcript-delta') utterances.set(key, (utterances.get(key) ?? '') + part.delta);
      else utterances.set(key, part.text);
      if (part.type === 'transcript-final' && part.id == null) unnamed++;
      return true;
    },
    get text() {
      return [...utterances.values()]
        .map((utterance) => utterance.trim())
        .filter(Boolean)
        .join(' ');
    },
  };
}
