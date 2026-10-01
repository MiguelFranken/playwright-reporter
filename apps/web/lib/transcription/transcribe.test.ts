import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRANSCRIPTION_MODEL, transcriptionEnabled, transcriptionModel } from './config';
import { canDictate } from './transcribe';

afterEach(() => vi.unstubAllEnvs());

describe('dictation', () => {
  it('is off unless the deployment turns it on', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', '');
    expect(transcriptionEnabled()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'yes');
    expect(transcriptionEnabled()).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', ' TRUE ');
    expect(transcriptionEnabled()).toBe(true);
  });

  it('uses the configured gateway model, or the default', () => {
    vi.stubEnv('TRANSCRIPTION_MODEL', '');
    expect(transcriptionModel()).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    vi.stubEnv('TRANSCRIPTION_MODEL', 'openai/whisper-1');
    expect(transcriptionModel()).toBe('openai/whisper-1');
  });

  it('is offered to signed-in people, never to the public demo account', () => {
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'true');
    vi.stubEnv('DEMO_USER_EMAIL', 'demo@example.com');
    expect(canDictate({ email: 'ada@example.com' })).toBe(true);
    expect(canDictate({ email: 'Demo@Example.com' })).toBe(false);
    expect(canDictate(null)).toBe(false);
    vi.stubEnv('TRANSCRIPTION_ENABLED', 'false');
    expect(canDictate({ email: 'ada@example.com' })).toBe(false);
  });
});
