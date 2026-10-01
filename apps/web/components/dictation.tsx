'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { DictationProvider, type Dictation, type DictationOptions, type DictationRecording } from '@miguelfranken/ui/provider';
import { client } from '@/lib/rpc/client';
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from '@/lib/transcription/config';

/*
 * Whether this session may dictate is known only once the session has been
 * read, and the shell around the pages does not wait for that: it paints at
 * once and streams the rest. So the answer arrives on its own, through
 * `EnableDictation` in a Suspense boundary of the shell, and the composers
 * show their microphone from then on.
 */
type Mode = 'off' | 'record' | 'live';
let mode: Mode = 'off';
const listeners = new Set<() => void>();

function setMode(next: Mode) {
  mode = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Rendered by the shell for a person the deployment lets dictate. `live`
 * streams the words while they are said; otherwise the recording is
 * transcribed when it stops.
 */
export function EnableDictation({ live }: { live: boolean }) {
  useEffect(() => {
    setMode(live ? 'live' : 'record');
    return () => setMode('off');
  }, [live]);
  return null;
}

/** Offers the composers below it the browser's microphone and the app's transcription. */
export function AppDictationProvider({ children }: { children: React.ReactNode }) {
  const current = useSyncExternalStore(subscribe, () => mode, () => 'off' as Mode);
  return <DictationProvider dictation={current === 'live' ? liveDictation : current === 'record' ? recordedDictation : null}>{children}</DictationProvider>;
}

const recordedDictation: Dictation = { start: () => startDictation(false) };
const liveDictation: Dictation = { start: (options) => startDictation(true, options) };

/** What the browser records in, best first: Opus where it can (Chrome, Firefox), AAC in Safari. */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** The live stream's audio: 16-bit mono PCM at the rate the realtime models take. */
const PCM_RATE = 24_000;

function microphoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new Error('Allow the microphone for this site to dictate.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error('No microphone was found.');
  if (name === 'NotReadableError') return new Error('The microphone is in use by another app.');
  return new Error('The microphone could not be opened.');
}

/**
 * Records what is said, and with `live` also streams it to AI Gateway as it
 * is said, reporting the words through `onTranscript`. The recording is kept
 * either way: when the live stream fails, it is transcribed after all.
 */
async function startDictation(live: boolean, options?: DictationOptions): Promise<DictationRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record audio.');
  }
  // Created inside the click, before anything is awaited, so the browser lets it play.
  const audioContext = live && typeof AudioWorkletNode !== 'undefined' ? new AudioContext() : null;
  const token = audioContext ? client.dictation.streamToken().catch(() => null) : null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    void audioContext?.close();
    throw microphoneError(error);
  }
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    void audioContext?.close().catch(() => {});
  };

  const recording = record(stream);
  if (!recording) {
    release();
    throw new Error('The microphone could not be opened.');
  }

  const streaming = audioContext && token ? await streamLive(stream, audioContext, token, options?.onTranscript).catch(() => null) : null;

  const end = () => {
    clearTimeout(limit);
    recording.stop();
    streaming?.stop();
  };
  // A recording left running stops by itself; what was said until then is kept for `stop`.
  const limit = setTimeout(end, MAX_RECORDING_SECONDS * 1000);

  return {
    stop: async () => {
      end();
      const [audio, spoken] = await Promise.all([recording.done, streaming?.done ?? Promise.resolve(null)]);
      release();
      if (spoken !== null) return spoken;
      return transcribeRecording(audio);
    },
    cancel: () => {
      end();
      streaming?.abort();
      release();
    },
  };
}

/** The whole recording, as the browser compresses it, for transcribing after it stops. */
function record(stream: MediaStream): { stop: () => void; done: Promise<Blob> } | null {
  const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder;
  try {
    // Speech needs little: 32 kbit/s keeps two minutes near half a megabyte.
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
  } catch {
    return null;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: (recorder.mimeType || mimeType || 'audio/webm').split(';')[0] }));
  });
  recorder.start();
  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    done,
  };
}

async function transcribeRecording(audio: Blob): Promise<string> {
  if (audio.size === 0) return '';
  if (audio.size > MAX_AUDIO_BYTES) throw new Error('That recording is too long.');
  const subtype = audio.type.split('/')[1] || 'webm';
  const extension = subtype === 'mp4' ? 'm4a' : subtype;
  try {
    const { text } = await client.dictation.transcribe({ audio: new File([audio], `dictation.${extension}`, { type: audio.type }) });
    return text;
  } catch {
    throw new Error('That could not be transcribed. Try again.');
  }
}

/*
 * Runs on the audio thread: turns the microphone's float samples, at whatever
 * rate the device runs, into 16-bit PCM at PCM_RATE, and posts them about ten
 * times a second. A context of its own at 24 kHz would spare the resampling,
 * but Firefox cannot connect a microphone to a context of another rate.
 */
const PCM_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / ${PCM_RATE};
    // Where the next output sample falls, in this block's input samples; -1 is the previous block's last one.
    this.position = 0;
    this.previous = 0;
    this.out = new Int16Array(${PCM_RATE / 10});
    this.length = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;
    const at = (i) => (i < 0 ? this.previous : input[i]);
    while (this.position < input.length - 1) {
      const index = Math.floor(this.position);
      const sample = at(index) + (at(index + 1) - at(index)) * (this.position - index);
      const clamped = Math.max(-1, Math.min(1, sample));
      this.out[this.length++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      if (this.length === this.out.length) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(${PCM_RATE / 10});
        this.length = 0;
      }
      this.position += this.step;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

/**
 * Streams the microphone to AI Gateway with a single-use token from the app,
 * and reports the words so far as they come back. `done` resolves with the
 * final text, or null when the stream failed and the recording is needed.
 */
async function streamLive(
  stream: MediaStream,
  audioContext: AudioContext,
  tokenRequest: Promise<{ token: string; model: string } | null>,
  onTranscript?: (text: string) => void,
): Promise<{ stop: () => void; abort: () => void; done: Promise<string | null> } | null> {
  const [secret, sdk, { liveTranscript }] = await Promise.all([tokenRequest, import('ai'), import('@/lib/transcription/live-transcript')]);
  if (!secret) return null;

  const moduleUrl = URL.createObjectURL(new Blob([PCM_WORKLET], { type: 'text/javascript' }));
  try {
    await audioContext.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const capture = new AudioWorkletNode(audioContext, 'pcm-capture');
  // Nothing is played back; the silent output only keeps the node running everywhere.
  const mute = audioContext.createGain();
  mute.gain.value = 0;
  source.connect(capture).connect(mute).connect(audioContext.destination);

  // Closing the stream tells the gateway the audio is over: it answers with the final words and ends.
  let closed = false;
  let close = () => {};
  const pcm = new ReadableStream<Uint8Array>({
    start(controller) {
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => controller.enqueue(new Uint8Array(event.data));
      close = () => controller.close();
    },
  });
  const closeAudio = () => {
    if (closed) return;
    closed = true;
    capture.port.onmessage = null;
    source.disconnect();
    capture.disconnect();
    close();
  };

  const abort = new AbortController();
  const gateway = sdk.createGateway({ apiKey: secret.token });
  const result = sdk.experimental_streamTranscribe({
    model: gateway.transcriptionModel(secret.model),
    audio: pcm,
    inputAudioFormat: { type: 'audio/pcm', rate: PCM_RATE },
    abortSignal: abort.signal,
  });

  const transcript = liveTranscript();
  const done = (async () => {
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
        if (transcript.add(part)) onTranscript?.(transcript.text);
      }
      return transcript.text;
    } catch (error) {
      if (abort.signal.aborted) return transcript.text;
      console.warn('[dictation] live transcription failed, transcribing the recording instead', error);
      return null;
    }
  })();

  return {
    stop: closeAudio,
    abort: () => {
      closeAudio();
      abort.abort();
    },
    done,
  };
}
