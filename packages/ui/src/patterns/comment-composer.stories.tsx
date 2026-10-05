import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DictationProvider, type Dictation } from '../provider';
import { CommentComposer } from './comment-composer';

const meta = {
  title: 'Patterns/Controls/CommentComposer',
  component: CommentComposer,
  args: { onSubmit: fn(), onCancel: fn() },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Enter posts, Shift + Enter starts a new line; the box clears after posting. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement).getByRole('textbox', { name: 'Comment' });
    await expect(within(canvasElement).getByRole('button', { name: 'Comment' })).toBeDisabled();
    await userEvent.type(box, 'Primary button{Shift>}{Enter}{/Shift}please');
    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('Primary button\nplease');
    await expect(box).toHaveValue('');
  },
};

export const CancelWithEscape: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('textbox', { name: 'Comment' }), 'never mind{Escape}');
    await expect(args.onCancel).toHaveBeenCalled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** A reply box: one line with the send button beside it. */
export const Compact: Story = { args: { compact: true, label: 'Reply', submitLabel: 'Reply', placeholder: 'Reply…', onCancel: undefined } };

export const Posting: Story = { args: { pending: true, initialValue: 'Primary button please' } };

/** A host whose microphone hears `spoken`, after `delay` ms of transcribing. */
function fakeDictation({ spoken = 'Make the primary button a little larger', delay = 0, refuse }: { spoken?: string; delay?: number; refuse?: string } = {}): Dictation {
  return {
    start: async () => {
      if (refuse) throw new Error(refuse);
      return {
        stop: () => new Promise((resolve) => setTimeout(() => resolve(spoken), delay)),
        cancel: () => {},
      };
    },
  };
}

/** A host that transcribes while it records: each word shows up as it is said, revised once at the end. */
function liveDictation(words: string[], final: string): Dictation {
  return {
    start: async ({ onTranscript } = {}) => {
      let said = 0;
      const timer = setInterval(() => {
        if (said < words.length) onTranscript?.(words.slice(0, ++said).join(' '));
      }, 20);
      return {
        stop: async () => {
          clearInterval(timer);
          return final;
        },
        cancel: () => clearInterval(timer),
      };
    },
  };
}

const withDictation = (dictation: Dictation) => (Story: () => React.ReactNode) => <DictationProvider dictation={dictation}>{Story()}</DictationProvider>;

/** With dictation offered: the microphone records, and the transcript lands in the draft to be read before posting. */
export const Dictate: Story = {
  args: { initialValue: 'Header:' },
  decorators: [withDictation(fakeDictation())],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Listening');
    await expect(canvas.getByRole('button', { name: 'Comment' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Stop dictating' }));
    const box = canvas.getByRole('textbox', { name: 'Comment' });
    await waitFor(() => expect(box).toHaveValue('Header: Make the primary button a little larger'));
    await expect(box).toHaveFocus();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Live dictation: the words appear in the box while they are spoken, after the draft. */
export const LiveDictation: Story = {
  args: { initialValue: 'Header:' },
  decorators: [withDictation(liveDictation(['make', 'the', 'button', 'larger'], 'Make the button larger.'))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Comment' });
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await waitFor(() => expect(box).toHaveValue('Header: make the button larger'));
    await userEvent.click(canvas.getByRole('button', { name: 'Stop dictating' }));
    await waitFor(() => expect(box).toHaveValue('Header: Make the button larger.'));
  },
};

/** A host whose live transcript the story speaks, one `say` at a time. */
function scriptedDictation(final: (said: string) => string = (said) => said) {
  let heard: ((text: string) => void) | undefined;
  let said = '';
  const dictation: Dictation = {
    start: async ({ onTranscript } = {}) => {
      heard = onTranscript;
      said = '';
      return { stop: async () => final(said), cancel: () => {} };
    },
  };
  const say = (text: string) => {
    said = text;
    heard?.(text);
  };
  return { dictation, say };
}

const misspoken = scriptedDictation((said) => `${said[0]?.toUpperCase()}${said.slice(1)}.`);

/**
 * The box stays editable while it listens: a word said twice is deleted with
 * the keyboard, the caret stays put, and the words said next follow the edit.
 */
export const EditWhileDictating: Story = {
  args: { initialValue: 'Header:' },
  decorators: [withDictation(misspoken.dictation)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole<HTMLTextAreaElement>('textbox', { name: 'Comment' });
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await expect(canvas.getByRole('button', { name: 'Stop dictating' })).toBeVisible();
    misspoken.say('make the the');
    await waitFor(() => expect(box).toHaveValue('Header: make the the'));
    await userEvent.click(box);
    box.setSelectionRange(box.value.length, box.value.length);
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}');
    await expect(box).toHaveValue('Header: make the');
    misspoken.say('make the the button larger');
    await waitFor(() => expect(box).toHaveValue('Header: make the button larger'));
    await expect(box.selectionStart).toBe(box.value.length);
    await userEvent.click(canvas.getByRole('button', { name: 'Stop dictating' }));
    // Only the words still live take the final revision; the ones edited stay as they were left.
    await waitFor(() => expect(box).toHaveValue('Header: make the button larger.'));
  },
};

const fixedEarlier = scriptedDictation();

/** Typing before the live words leaves them live: they keep being revised, after the edit. */
export const EditBeforeLiveWords: Story = {
  args: { initialValue: 'Haeder:' },
  decorators: [withDictation(fixedEarlier.dictation)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole<HTMLTextAreaElement>('textbox', { name: 'Comment' });
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await expect(canvas.getByRole('button', { name: 'Stop dictating' })).toBeVisible();
    fixedEarlier.say('make it');
    await waitFor(() => expect(box).toHaveValue('Haeder: make it'));
    await userEvent.click(box);
    box.setSelectionRange(1, 3);
    await userEvent.keyboard('ea');
    await expect(box).toHaveValue('Header: make it');
    fixedEarlier.say('Make it bigger');
    await waitFor(() => expect(box).toHaveValue('Header: Make it bigger'));
    await expect(box.selectionStart).toBe(3);
  },
};

/** Escape during live dictation takes the live words back out. */
export const CancelLiveDictation: Story = {
  args: { initialValue: 'Keep this' },
  decorators: [withDictation(liveDictation(['never', 'mind'], 'Never mind.'))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Comment' });
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await waitFor(() => expect(box).toHaveValue('Keep this never mind'));
    await userEvent.click(box);
    await userEvent.keyboard('{Escape}');
    await expect(box).toHaveValue('Keep this');
  },
};

/** Recording: the microphone turns into a stop button. */
export const Listening: Story = {
  decorators: [withDictation(fakeDictation())],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Dictate' }));
    await expect(within(canvasElement).getByRole('button', { name: 'Stop dictating' })).toBeVisible();
  },
};

/** Waiting for the transcript. */
export const Transcribing: Story = {
  decorators: [withDictation(fakeDictation({ delay: 60_000 }))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Stop dictating' }));
    await expect(canvas.getByRole('button', { name: 'Transcribing' })).toBeDisabled();
    await expect(canvas.getByRole('status')).toHaveTextContent('Transcribing…');
  },
};

/** Escape throws the recording away, and keeps the draft and the composer. */
export const CancelDictation: Story = {
  args: { initialValue: 'Keep this' },
  decorators: [withDictation(fakeDictation())],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await userEvent.click(canvas.getByRole('textbox', { name: 'Comment' }));
    await userEvent.keyboard('{Escape}');
    await expect(args.onCancel).not.toHaveBeenCalled();
    await expect(canvas.getByRole('button', { name: 'Dictate' })).toBeEnabled();
    await expect(canvas.getByRole('textbox', { name: 'Comment' })).toHaveValue('Keep this');
  },
};

/** The browser refused the microphone: the reason shows where the hint was. */
export const MicrophoneRefused: Story = {
  decorators: [withDictation(fakeDictation({ refuse: 'Allow the microphone for this site to dictate.' }))],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dictate' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Allow the microphone for this site to dictate.');
  },
};

/** A reply box with dictation: the microphone sits beside the send button. */
export const CompactDictation: Story = {
  args: { ...Compact.args },
  decorators: [withDictation(fakeDictation({ refuse: 'Allow the microphone for this site to dictate.' }))],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Dictate' }));
    await expect(within(canvasElement).getByRole('status')).toBeVisible();
  },
};
