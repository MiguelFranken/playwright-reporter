/**
 * Dictating comments: speech to text through Vercel AI Gateway. Off unless a
 * deployment turns it on, since every transcript is billed to whoever owns the
 * gateway key. Parsed on every call so tests can flip a variable.
 */

/** OpenAI's newer transcription model at a fraction of `gpt-4o-transcribe`'s price, and more accurate than `whisper-1`. */
export const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';

/** Comments are short: two minutes is plenty, and a recording stops by itself there. */
export const MAX_RECORDING_SECONDS = 120;

/** Under the 4.5 MB request body a Vercel function accepts; two minutes of Opus is about half a megabyte. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export function transcriptionEnabled() {
  return (process.env.TRANSCRIPTION_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/** A gateway model id, `provider/model`. */
export function transcriptionModel() {
  return process.env.TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}
