import { describe, expect, it } from 'vitest';
import { beginDictation, dropLive, editDraft, moveCaret, showTranscript } from './dictated-draft';

describe('dictated draft', () => {
  it('shows the transcript after the draft, a space apart, and lets it be revised', () => {
    let draft = showTranscript(beginDictation('Header:'), 'make the');
    expect(draft.value).toBe('Header: make the');
    draft = showTranscript(draft, 'Make the button larger.');
    expect(draft.value).toBe('Header: Make the button larger.');
    expect(showTranscript(beginDictation('Header: '), 'make').value).toBe('Header: make');
    expect(showTranscript(beginDictation(''), 'make').value).toBe('make');
  });

  it('keeps the live words live when the text before them is edited', () => {
    let draft = showTranscript(beginDictation('Haeder:'), 'make the');
    draft = editDraft(draft, 'Header: make the');
    expect(draft.live).toBe(' make the');
    draft = showTranscript(draft, 'Make the button');
    expect(draft.value).toBe('Header: Make the button');
  });

  it('hands the words over when one is deleted, and writes the next ones where the edit ended', () => {
    let draft = showTranscript(beginDictation('Header:'), 'make the the');
    draft = editDraft(draft, 'Header: make the');
    expect(draft.live).toBe('');
    draft = showTranscript(draft, 'make the the button larger');
    expect(draft.value).toBe('Header: make the button larger');
    // The final transcript revises only the words still live.
    draft = showTranscript(draft, 'Make the the button larger.');
    expect(draft.value).toBe('Header: make the button larger.');
  });

  it('continues after text typed at the end of the live words', () => {
    let draft = showTranscript(beginDictation(''), 'make it');
    draft = editDraft(draft, 'make it blue,');
    draft = showTranscript(draft, 'make it please');
    expect(draft.value).toBe('make it blue, please');
  });

  it('writes the next words where a stretch of handed-over words was retyped', () => {
    let draft = showTranscript(beginDictation(''), 'the read button');
    draft = editDraft(draft, 'the red button');
    draft = showTranscript(draft, 'the read button is too small');
    expect(draft.value).toBe('the red button is too small');
  });

  it('leaves an edit after the live words alone', () => {
    let draft = beginDictation('Header: and more');
    draft = { ...draft, start: 7 };
    draft = showTranscript(draft, 'make');
    expect(draft.value).toBe('Header: make and more');
    draft = editDraft(draft, 'Header: make and much more');
    expect(draft.live).toBe(' make');
    expect(showTranscript(draft, 'make it').value).toBe('Header: make it and much more');
  });

  it('drops only the live words on cancel', () => {
    let draft = showTranscript(beginDictation('Keep this'), 'never mind');
    expect(dropLive(draft)).toBe('Keep this');
    draft = editDraft(draft, 'Keep this never');
    draft = showTranscript(draft, 'never mind again');
    expect(dropLive(draft)).toBe('Keep this never');
  });

  it('stays within the length limit', () => {
    expect(showTranscript(beginDictation('abc', 8), 'make it larger').value).toBe('abc make');
  });

  it('keeps the caret before the live words, and after them at their end', () => {
    const before = showTranscript(beginDictation('Header:'), 'make');
    const after = showTranscript(before, 'make the button');
    expect(moveCaret(before, after, 3)).toBe(3);
    expect(moveCaret(before, after, before.value.length)).toBe(after.value.length);
    expect(moveCaret(before, after, 10)).toBe(after.value.length);
    const empty = beginDictation('Header:');
    expect(moveCaret(empty, showTranscript(empty, 'make'), 7)).toBe('Header: make'.length);
  });
});
