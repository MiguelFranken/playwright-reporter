import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { CommentTool, MarkupColor } from '../../lib/review-markup';
import { MarkupToolbar } from './markup-toolbar';

const meta = {
  title: 'Views/Review/Comments/MarkupToolbar',
  component: MarkupToolbar,
  args: { tool: 'pin', color: 'red', onToolChange: fn(), onColorChange: fn(), onUndo: fn(), onClose: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MarkupToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Placing pins: the colours are away until a drawing tool is picked. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Area' })).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.queryByRole('button', { name: 'Blue' })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Pen' }));
    await expect(args.onToolChange).toHaveBeenCalledWith('pen');
    await userEvent.click(canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** Commenting on an area: no colours either. */
export const Area: Story = {
  args: { tool: 'area' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Area' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('group', { name: 'Colour' })).toBeNull();
  },
};

/** Drawing in blue, with something to take back. */
export const Drawing: Story = {
  args: { tool: 'ellipse', color: 'blue', canUndo: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Yellow' }));
    await expect(args.onColorChange).toHaveBeenCalledWith('yellow');
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(args.onUndo).toHaveBeenCalled();
  },
};

/** Held the way the viewer holds it: picking a tool and a colour sticks. */
export const Interactive: Story = {
  render: function Render(args) {
    const [tool, setTool] = useState<CommentTool>('pen');
    const [color, setColor] = useState<MarkupColor>('red');
    return <MarkupToolbar {...args} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Arrow' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Green' }));
    await expect(canvas.getByRole('button', { name: 'Arrow' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Erasing: the eraser draws nothing, so no colours. */
export const Erasing: Story = {
  args: { tool: 'eraser', canUndo: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('group', { name: 'Colour' })).toBeNull();
  },
};

/** Without a way to leave comment mode from the bar. */
export const WithoutClose: Story = { args: { onClose: undefined, tool: 'highlighter', color: 'yellow' } };
