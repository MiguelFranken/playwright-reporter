'use client';

import { ArrowUp, Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Kbd } from '../components/kbd';
import { cn } from '../lib/cn';
import { beginDictation, dropLive, editDraft, moveCaret, showTranscript, type DictatedDraft } from '../lib/dictated-draft';
import { useDictation, type DictationRecording } from '../provider';

type DictationState = { kind: 'idle' } | { kind: 'starting' } | { kind: 'recording' } | { kind: 'transcribing' } | { kind: 'failed'; message: string };

/**
 * Where a comment is written: a growing text box that posts on Enter (Shift
 * + Enter for a new line) and gives up on Escape. It clears itself after
 * posting; the host adds the comment (optimistically) and reports `pending`.
 *
 * When the host offers dictation (`DictationProvider`), a microphone records
 * what is said and adds its transcript to the draft, to be read before posting
 * — word by word while it is said, where the host transcribes live. The box
 * stays editable meanwhile: a misheard word can be deleted or retyped while
 * the dictation goes on, and the words heard next follow the edit.
 */
export function CommentComposer({
  onSubmit,
  onCancel,
  label = 'Comment',
  placeholder = 'Add a comment…',
  submitLabel = 'Comment',
  initialValue = '',
  pending = false,
  autoFocus = false,
  maxLength = 4000,
  compact = false,
  className,
}: {
  onSubmit: (body: string) => void;
  /** Shows a Cancel button; Escape calls it too. */
  onCancel?: () => void;
  /** Accessible name of the text box. */
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  initialValue?: string;
  pending?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** One line with the send button beside it, for replies. */
  compact?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const empty = value.trim().length === 0;

  const dictation = useDictation();
  const [dictating, setDictating] = useState<DictationState>({ kind: 'idle' });
  const recording = useRef<DictationRecording | null>(null);
  // Bumped whenever a dictation is given up, so a microphone that opens late is closed again.
  const attempt = useRef(0);
  // Where the dictation writes in the draft while it runs (see `DictatedDraft`).
  const draft = useRef<DictatedDraft | null>(null);
  // Where the caret goes once the dictation has written, so new words do not move it out from under the person.
  const caret = useRef<[number, number] | null>(null);
  const busy = dictating.kind === 'starting' || dictating.kind === 'recording' || dictating.kind === 'transcribing';

  useLayoutEffect(() => {
    const box = ref.current;
    if (box && caret.current) box.setSelectionRange(...caret.current);
    caret.current = null;
  }, [value]);

  /** Writes what the dictation heard, keeping a focused box's caret where it belongs. */
  const write = (next: DictatedDraft) => {
    const box = ref.current;
    const previous = draft.current;
    if (box && previous && box.ownerDocument.activeElement === box) {
      caret.current = [moveCaret(previous, next, box.selectionStart), moveCaret(previous, next, box.selectionEnd)];
    }
    draft.current = next;
    setValue(next.value);
  };

  // A composer that closes mid-sentence lets go of the microphone.
  useEffect(
    () => () => {
      attempt.current++;
      recording.current?.cancel();
    },
    [],
  );

  const startDictating = async () => {
    if (!dictation) return;
    const mine = ++attempt.current;
    draft.current = beginDictation(value, maxLength);
    setDictating({ kind: 'starting' });
    try {
      const started = await dictation.start({
        onTranscript: (text) => {
          if (attempt.current === mine && recording.current !== null && draft.current) write(showTranscript(draft.current, text));
        },
      });
      if (attempt.current !== mine) return started.cancel();
      recording.current = started;
      setDictating({ kind: 'recording' });
    } catch (error) {
      if (attempt.current !== mine) return;
      draft.current = null;
      setDictating({ kind: 'failed', message: error instanceof Error ? error.message : 'The microphone could not be opened.' });
    }
  };

  const stopDictating = async () => {
    const current = recording.current;
    if (!current) return;
    setDictating({ kind: 'transcribing' });
    try {
      const spoken = (await current.stop()).trim();
      // Escape while it was being transcribed threw the recording away.
      if (recording.current !== current) return;
      recording.current = null;
      const heard = draft.current;
      if (heard) write(showTranscript(heard, spoken));
      draft.current = null;
      // Words the person already kept were heard, even when the final transcript comes back empty.
      setDictating(spoken || heard?.heard ? { kind: 'idle' } : { kind: 'failed', message: 'Nothing was heard. Try again.' });
      ref.current?.focus();
    } catch (error) {
      if (recording.current !== current) return;
      // Words shown live stay: they are what was heard, even if the last of it was lost.
      recording.current = null;
      draft.current = null;
      setDictating({ kind: 'failed', message: error instanceof Error ? error.message : 'That could not be transcribed.' });
    }
  };

  const cancelDictating = () => {
    attempt.current++;
    recording.current?.cancel();
    recording.current = null;
    // The words still live go; what the person typed, or kept, stays.
    if (draft.current) setValue(dropLive(draft.current));
    draft.current = null;
    setDictating({ kind: 'idle' });
  };

  const submit = () => {
    if (empty || pending || busy) return;
    onSubmit(value.trim());
    setValue('');
    setDictating({ kind: 'idle' });
  };

  const mic = dictation ? (
    <DictationButton
      state={dictating.kind}
      disabled={pending}
      onStart={startDictating}
      onStop={stopDictating}
    />
  ) : null;

  const status =
    dictating.kind === 'recording'
      ? 'Listening…'
      : dictating.kind === 'transcribing'
        ? 'Transcribing…'
        : dictating.kind === 'failed'
          ? dictating.message
          : null;

  return (
    <form
      className={cn('flex flex-col gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className={cn('flex gap-2', compact ? 'items-end' : 'flex-col')}>
        <textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => {
            if (draft.current) draft.current = editDraft(draft.current, e.target.value);
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && busy) {
              // A recording goes first, the draft only on a second Escape.
              e.preventDefault();
              e.stopPropagation();
              cancelDictating();
            } else if (e.key === 'Escape' && onCancel) {
              // The draft goes, not the dialog around it.
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-busy={busy || undefined}
          rows={1}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          disabled={pending}
          className={cn(
            'field-sizing-content max-h-48 min-h-9 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30',
            compact && 'flex-1',
          )}
        />
        {compact ? (
          <>
            {mic}
            <Button type="submit" size="icon-sm" aria-label={submitLabel} disabled={empty || pending || busy}>
              <ArrowUp />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {status ? null : (
              <span className="hidden items-center gap-1 text-label-xs whitespace-nowrap text-muted-foreground sm:inline-flex" title="Shift + Enter for a new line">
                <Kbd>↵</Kbd> to post
              </span>
            )}
            {status ? <DictationStatus failed={dictating.kind === 'failed'}>{status}</DictationStatus> : null}
            <div className="ml-auto flex gap-2">
              {mic}
              {onCancel ? (
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={empty || pending || busy}>
                {pending ? 'Posting…' : submitLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
      {compact && status ? <DictationStatus failed={dictating.kind === 'failed'}>{status}</DictationStatus> : null}
    </form>
  );
}

function DictationStatus({ failed, children }: { failed: boolean; children: string }) {
  return (
    <span role="status" className={cn('min-w-0 text-label-xs text-pretty', failed ? 'text-danger-text' : 'text-muted-foreground')}>
      {children}
    </span>
  );
}

/** The microphone: starts a recording, and while one runs, stops it. */
function DictationButton({
  state,
  disabled,
  onStart,
  onStop,
}: {
  state: DictationState['kind'];
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (state === 'recording') {
    return (
      <Button type="button" size="icon-sm" variant="destructive" aria-label="Stop dictating" onClick={onStop}>
        <Square className="size-3 fill-current motion-safe:animate-pulse" />
      </Button>
    );
  }
  const waiting = state === 'starting' || state === 'transcribing';
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={state === 'transcribing' ? 'Transcribing' : 'Dictate'}
      title="Dictate"
      disabled={disabled || waiting}
      onClick={onStart}
    >
      {waiting ? <Loader2 className="animate-spin" /> : <Mic />}
    </Button>
  );
}
