import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STREAMING_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  transcriptionEnabled,
  transcriptionModel,
  transcriptionProvider,
  transcriptionStreaming,
  transcriptionStreamingModel,
} from './config';
import { canDictate, OPENROUTER_BASE_URL, transcribeAudio } from './transcribe';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('dictation', () => {
  it('is off unless the deployment turns it on', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', '');
    expect(transcriptionEnabled()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'yes');
    expect(transcriptionEnabled()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', ' TRUE ');
    expect(transcriptionEnabled()).toBe(true);
  });

  it('uses AI Gateway unless told otherwise, and nothing it does not know', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'true');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', '');
    expect(transcriptionProvider()).toBe('gateway');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'OpenRouter');
    expect(transcriptionProvider()).toBe('openrouter');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'openai');
    expect(transcriptionProvider()).toBeNull();
    expect(transcriptionEnabled()).toBe(false);
  });

  it('offers OpenRouter only with a key', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'true');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'openrouter');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(transcriptionEnabled()).toBe(false);
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(transcriptionEnabled()).toBe(true);
  });

  it('streams on AI Gateway unless turned off, never on OpenRouter', () => {
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'gateway');
    vi.stubEnv('TRANSCRIPTION_STREAMING', '');
    expect(transcriptionStreaming()).toBe(true);
    vi.stubEnv('TRANSCRIPTION_STREAMING', 'false');
    expect(transcriptionStreaming()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_STREAMING', '');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'openrouter');
    expect(transcriptionStreaming()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_STREAMING_MODEL', '');
    expect(transcriptionStreamingModel()).toBe(DEFAULT_STREAMING_MODEL);
  });

  it('uses the configured model, or the default', () => {
    vi.stubEnv('TRANSCRIPTION_MODEL', '');
    expect(transcriptionModel()).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    vi.stubEnv('TRANSCRIPTION_MODEL', 'openai/whisper-1');
    expect(transcriptionModel()).toBe('openai/whisper-1');
  });

  it('is offered to signed-in people, never to the public demo account', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'true');
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'gateway');
    vi.stubEnv('DEMO_USER_EMAIL', 'demo@example.com');
    expect(canDictate({ email: 'ada@example.com' })).toBe(true);
    expect(canDictate({ email: 'Demo@Example.com' })).toBe(false);
    expect(canDictate(null)).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'false');
    expect(canDictate({ email: 'ada@example.com' })).toBe(false);
  });

  it("sends OpenRouter OpenAI's transcription request", async () => {
    vi.stubEnv('TRANSCRIPTION_PROVIDER', 'openrouter');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    vi.stubEnv('TRANSCRIPTION_MODEL', 'openai/gpt-transcribe');
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ text: ' Make the button larger. ', usage: { seconds: 2 } }),
    );
    vi.stubGlobal('fetch', fetch);

    // An Opus/WebM file starts with the EBML header, which tells the SDK its type.
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    await expect(transcribeAudio(webm)).resolves.toBe('Make the button larger.');

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`${OPENROUTER_BASE_URL}/audio/transcriptions`);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-or-test');
    const form = init?.body as FormData;
    expect(form.get('model')).toBe('openai/gpt-transcribe');
    expect((form.get('file') as File).type).toBe('audio/webm');
  });
});
