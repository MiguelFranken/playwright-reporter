/**
 * A text box that dictation writes into while the person may still type in it.
 *
 * The words heard so far and not yet touched sit in one stretch of the text,
 * `live`, from `start`: each new transcript replaces that stretch, so the host
 * may revise them until they are final. Typing elsewhere leaves them live and
 * only moves them along. Typing into them, or right after them, hands them
 * over: they become the person's text, and the words heard after that go in
 * where they stopped, counted in words of the transcript (`heard`) so a
 * revised capital or comma does not shift them.
 */
export interface DictatedDraft {
  value: string;
  /** Where the live words begin, in `value`. */
  start: number;
  /** The live words, with the spaces that set them apart from the text around them. */
  live: string;
  /** Words of the transcript handed over to the person; the live words follow them. */
  heard: number;
  /** Words of the transcript shown so far, handed over or live. */
  shown: number;
  maxLength: number;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** A dictation starting after what is already written. */
export function beginDictation(value: string, maxLength = Infinity): DictatedDraft {
  return { value, start: value.length, live: '', heard: 0, shown: 0, maxLength };
}

/**
 * Shows the transcript so far (or the final one) in the live stretch: the
 * words after those already handed over, a space apart from the text on
 * either side.
 */
export function showTranscript(draft: DictatedDraft, transcript: string): DictatedDraft {
  const all = words(transcript);
  const text = all.slice(draft.heard).join(' ');
  const end = draft.start + draft.live.length;
  const head = draft.value.slice(0, draft.start);
  const tail = draft.value.slice(end);
  let live = text ? `${isSpace(head.at(-1)) ? '' : ' '}${text}${isSpace(tail[0]) ? '' : ' '}` : '';
  live = live.slice(0, Math.max(0, draft.maxLength - head.length - tail.length));
  return { ...draft, value: head + live + tail, live, shown: Math.max(draft.heard, all.length) };
}

/** The text the person left in the box, given the text it held: the range that changed, before and after. */
function changed(before: string, after: string) {
  let from = 0;
  const shorter = Math.min(before.length, after.length);
  while (from < shorter && before[from] === after[from]) from++;
  let back = 0;
  while (back < shorter - from && before[before.length - 1 - back] === after[after.length - 1 - back]) back++;
  return { from, to: before.length - back, newTo: after.length - back };
}

/** The person changed the text to `value` while the dictation runs. */
export function editDraft(draft: DictatedDraft, value: string): DictatedDraft {
  const { from, to, newTo } = changed(draft.value, value);
  const delta = newTo - to;
  const end = draft.start + draft.live.length;
  if (draft.live && to <= draft.start) return { ...draft, value, start: draft.start + delta };
  if (draft.live && from > end) return { ...draft, value };
  // Typed into the live words or right after them: they are the person's now, and the next ones follow the edit.
  const at = end >= to ? end + delta : end <= from ? end : newTo;
  return { ...draft, value, start: at, live: '', heard: draft.shown };
}

/** The text without the live words: what a cancelled dictation leaves. */
export function dropLive(draft: DictatedDraft): string {
  return draft.value.slice(0, draft.start) + draft.value.slice(draft.start + draft.live.length);
}

/** Where a caret at `offset` belongs once the live words changed from `before` to `after`. */
export function moveCaret(before: DictatedDraft, after: DictatedDraft, offset: number): number {
  const end = before.start + before.live.length;
  if (offset >= end) return offset + after.live.length - before.live.length;
  if (offset <= before.start) return offset;
  return after.start + after.live.length;
}
