/**
 * Dictating comments: speech to text through Vercel AI Gateway or OpenRouter.
 * Off unless a deployment turns it on, since every transcript is billed to
 * whoever owns the key. Parsed on every call so tests can flip a variable.
 */

export const TRANSCRIPTION_PROVIDERS = ['gateway', 'openrouter'] as const;
export type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDERS)[number];

/**
 * OpenAI's newer transcription model at a fraction of `gpt-4o-transcribe`'s
 * price, and more accurate than `whisper-1`. Both providers know it by this id.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';

/** Comments are short: two minutes is plenty, and a recording stops by itself there. */
export const MAX_RECORDING_SECONDS = 120;

/** Under the 4.5 MB request body a Vercel function accepts; two minutes of Opus is about half a megabyte. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** `gateway` unless set; an unknown name is null, and turns dictation off rather than guessing. */
export function transcriptionProvider(): TranscriptionProvider | null {
  const raw = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase() || 'gateway';
  return (TRANSCRIPTION_PROVIDERS as readonly string[]).includes(raw) ? (raw as TranscriptionProvider) : null;
}

export function openRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

/**
 * Turned on, with a provider it can reach. AI Gateway's credentials cannot be
 * checked up front (on Vercel they are the deployment's OIDC token), but
 * OpenRouter without a key would only ever fail, so it offers no microphone.
 */
export function transcriptionEnabled() {
  if ((process.env.TRANSCRIPTION_ENABLED ?? '').trim().toLowerCase() !== 'true') return false;
  const provider = transcriptionProvider();
  return provider === 'gateway' || (provider === 'openrouter' && !!openRouterApiKey());
}

/** The provider's model id, `vendor/model` on both. */
export function transcriptionModel() {
  return process.env.TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}
