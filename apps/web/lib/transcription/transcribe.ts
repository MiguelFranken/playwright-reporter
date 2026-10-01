import 'server-only';
import { gateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { NoTranscriptGeneratedError, transcribe, type TranscriptionModel } from 'ai';
import { isDemoUser } from '@/lib/auth/demo';
import {
  openRouterApiKey,
  transcriptionEnabled,
  transcriptionModel,
  transcriptionProvider,
  transcriptionStreaming,
  transcriptionStreamingModel,
} from './config';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * The configured model. AI Gateway authenticates with `AI_GATEWAY_API_KEY`,
 * or on Vercel with the deployment's own OIDC token. OpenRouter has no
 * transcription model in its own AI SDK provider, but its endpoint takes
 * OpenAI's request, so the OpenAI provider is pointed at it.
 */
export function resolveTranscriptionModel(): TranscriptionModel {
  const id = transcriptionModel();
  if (transcriptionProvider() === 'openrouter') {
    const openrouter = createOpenAI({
      name: 'openrouter',
      baseURL: OPENROUTER_BASE_URL,
      apiKey: openRouterApiKey() ?? undefined,
      headers: { 'X-Title': 'Playwright Reporter' },
    });
    return openrouter.transcription(id);
  }
  return gateway.transcriptionModel(id);
}

/** What was said in a recording. Silence is an empty string, not an error. */
export async function transcribeAudio(audio: Uint8Array, signal?: AbortSignal): Promise<string> {
  try {
    const { text } = await transcribe({
      model: resolveTranscriptionModel(),
      audio,
      abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
    });
    return text.trim();
  } catch (error) {
    if (NoTranscriptGeneratedError.isInstance(error)) return '';
    throw error;
  }
}

/**
 * Whether this person is offered the microphone: the deployment turned it on,
 * and they are not the public demo account, which anyone with the link is.
 */
export function canDictate(user: { email: string } | null | undefined): boolean {
  return transcriptionEnabled() && !!user && !isDemoUser(user);
}

/**
 * A single-use secret the browser opens AI Gateway's streaming transcription
 * with, for one recording: the gateway credential never leaves the server, and
 * the audio goes straight from the browser to the gateway.
 */
export async function streamingToken(): Promise<{ token: string; model: string }> {
  if (!transcriptionStreaming()) throw new Error('Streaming transcription is off.');
  const model = transcriptionStreamingModel();
  const { token } = await gateway.experimental_transcription.getToken({ model, expiresAfterSeconds: 60 });
  return { token, model };
}
