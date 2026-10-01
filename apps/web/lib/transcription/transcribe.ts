import 'server-only';
import { gateway } from '@ai-sdk/gateway';
import { NoTranscriptGeneratedError, transcribe } from 'ai';
import { isDemoUser } from '@/lib/auth/demo';
import { transcriptionEnabled, transcriptionModel } from './config';

/**
 * What was said in a recording, through AI Gateway. It authenticates with
 * `AI_GATEWAY_API_KEY`, or on Vercel with the deployment's own OIDC token.
 * Silence is an empty string, not an error.
 */
export async function transcribeAudio(audio: Uint8Array, signal?: AbortSignal): Promise<string> {
  try {
    const { text } = await transcribe({
      model: gateway.transcriptionModel(transcriptionModel()),
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
