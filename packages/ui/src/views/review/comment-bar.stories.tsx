import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { CommentTool, MarkupColor } from '../../lib/review-markup';
import { CommentBar } from './markup-toolbar';

const meta = {
  title: 'Views/Review/Comments/CommentBar',
  component: CommentBar,
  args: { commenting: false, onCommentingChange: fn(), tool: 'pin', color: 'red', onToolChange: fn(), onColorChange: fn(), onUndo: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CommentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Folded: one button that turns comment mode on. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('toolbar', { name: 'Comment tools' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await expect(args.onCommentingChange).toHaveBeenCalledWith(true);
  },
};

/** Folded, with the open comments on the screen counted. */
export const WithOpenComments: Story = { args: { openCount: 4 } };

/** Unfolded: the tools, and the button that folds the bar again. */
export const Commenting: Story = {
  args: { commenting: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(args.onCommentingChange).toHaveBeenCalledWith(false);
  },
};

/** The way the viewer holds it: a click unfolds it, Stop commenting folds it. */
export const Interactive: Story = {
  render: (args) => {
    const [commenting, setCommenting] = useState(false);
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting={commenting} onCommentingChange={setCommenting} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Pen' }));
    await expect(canvas.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(await canvas.findByRole('button', { name: 'Comment' })).toBeInTheDocument();
  },
};

const POSITION_KEY = 'story:comment-bar-position';

/** Moved off what it covers by its grip, with the keys here; the browser remembers where, and Home puts it back. */
export const Moved: Story = {
  args: { positionKey: POSITION_KEY },
  decorators: [
    (Story) => (
      <div data-float-bounds className="flex h-72 w-96 items-end justify-center rounded-lg border border-dashed border-border pb-4">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    localStorage.removeItem(POSITION_KEY);
    return () => localStorage.removeItem(POSITION_KEY);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grip = canvas.getByRole('button', { name: 'Move the comment bar' });
    grip.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowLeft}');
    // The inline value: the computed one is still easing there.
    await expect(canvasElement.querySelector<HTMLElement>('[data-slot="comment-bar"]')?.style.translate).toBe('-16px -32px');
    await expect(JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null')).toEqual({ x: -16, y: -32 });
    await userEvent.keyboard('{Home}');
    await expect(localStorage.getItem(POSITION_KEY)).toBeNull();
  },
};

/** Drawing: the colours have slid open beside the tools, and the bar has eased wider to hold them. */
export const Drawing: Story = {
  render: (args) => {
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Blue' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Pen' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Blue' }));
    await expect(canvas.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/**
 * Unfolding grows the bar from its middle, so its tools slide along under a pointer that has not moved: none
 * of them flashes its tooltip on the way. The tooltips are back once the pointer itself moves again.
 */
export const NoTooltipsWhileItGrows: Story = {
  render: (args) => {
    const [commenting, setCommenting] = useState(false);
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting={commenting} onCommentingChange={setCommenting} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tooltip = () => document.body.querySelector('[data-slot="tooltip-content"]');
    // The pointer, at the middle of an element: the bar tells a real movement from a still pointer by its coordinates.
    const pointAt = (name: string) => {
      const target = canvas.getByRole('button', { name });
      const r = target.getBoundingClientRect();
      return userEvent.pointer({ target, coords: { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 } });
    };
    await pointAt('Comment');
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    // A tool slides in under the pointer while the bar grows.
    await canvas.findByRole('button', { name: 'Area' });
    await pointAt('Area');
    await new Promise((r) => setTimeout(r, 700));
    await expect(tooltip()).toBeNull();
    // Settled, the reviewer moves the pointer: the tooltips answer again.
    await pointAt('Pen');
    await pointAt('Arrow');
    await waitFor(() => expect(tooltip()).toHaveTextContent('Arrow'));
  },
};
