import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
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
