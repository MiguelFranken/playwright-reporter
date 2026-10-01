'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { DictationProvider, type Dictation, type DictationRecording } from '@miguelfranken/ui/provider';
import { client } from '@/lib/rpc/client';
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from '@/lib/transcription/config';

/*
 * Whether this session may dictate is known only once the session has been
 * read, and the shell around the pages does not wait for that: it paints at
 * once and streams the rest. So the answer arrives on its own, through
 * `EnableDictation` in a Suspense boundary of the shell, and the composers
 * show their microphone from then on.
 */
let enabled = false;
const listeners = new Set<() => void>();

function setEnabled(next: boolean) {
  enabled = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Rendered by the shell for a person the deployment lets dictate. */
export function EnableDictation() {
  useEffect(() => {
    setEnabled(true);
    return () => setEnabled(false);
  }, []);
  return null;
}

/** Offers the composers below it the browser's microphone and the app's transcription. */
export function AppDictationProvider({ children }: { children: React.ReactNode }) {
  const on = useSyncExternalStore(subscribe, () => enabled, () => false);
  return <DictationProvider dictation={on ? dictation : null}>{children}</DictationProvider>;
}

const dictation: Dictation = { start: startRecording };

/** What the browser records in, best first: Opus where it can (Chrome, Firefox), AAC in Safari. */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function microphoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new Error('Allow the microphone for this site to dictate.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error('No microphone was found.');
  if (name === 'NotReadableError') return new Error('The microphone is in use by another app.');
  return new Error('The microphone could not be opened.');
}

async function startRecording(): Promise<DictationRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record audio.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    throw microphoneError(error);
  }
  const release = () => stream.getTracks().forEach((track) => track.stop());

  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder;
  try {
    // Speech needs little: 32 kbit/s keeps two minutes near half a megabyte.
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
  } catch (error) {
    release();
    throw microphoneError(error);
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  const end = () => {
    clearTimeout(limit);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.start();
  // A recording left running stops by itself; what was said until then is kept for `stop`.
  const limit = setTimeout(end, MAX_RECORDING_SECONDS * 1000);

  return {
    stop: async () => {
      end();
      await stopped;
      release();
      const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
      const audio = new Blob(chunks, { type });
      if (audio.size === 0) return '';
      if (audio.size > MAX_AUDIO_BYTES) throw new Error('That recording is too long.');
      const extension = type.split('/')[1] === 'mp4' ? 'm4a' : type.split('/')[1];
      try {
        const { text } = await client.dictation.transcribe({ audio: new File([audio], `dictation.${extension}`, { type }) });
        return text;
      } catch {
        throw new Error('That could not be transcribed. Try again.');
      }
    },
    cancel: () => {
      end();
      release();
    },
  };
}
