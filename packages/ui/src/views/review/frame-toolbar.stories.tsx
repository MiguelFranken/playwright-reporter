import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { DEFAULT_FRAME, type FrameSettings } from '../../lib/review';
import { FrameToolbar } from './frame-toolbar';

function Hosted(props: { initial?: FrameSettings; captured?: { width: number; height: number } | null; onChange?: (next: FrameSettings) => void }) {
  const [value, setValue] = useState(props.initial ?? DEFAULT_FRAME);
  return (
    <FrameToolbar
      value={value}
      captured={props.captured}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Screens/FrameToolbar',
  component: Hosted,
  args: { captured: { width: 390, height: 844 }, onChange: fn() },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "As captured" shows the capture's own viewport; editing it switches to a custom screen. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('spinbutton', { name: 'Screen width' })).toHaveValue(390);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Screen' }));
    await userEvent.click(await screen.findByRole('option', { name: /Laptop/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'laptop', width: 1440, height: 900 }));
    await userEvent.click(canvas.getByRole('button', { name: 'Rotate screen' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'custom', width: 900, height: 1440 }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zoom' }));
    await userEvent.click(await screen.findByRole('option', { name: '50%' }));
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 0.5 }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  },
};

/** Several variants on screen: "As captured" keeps each at its own size, so there is nothing to type. */
/** The screen presets, open: each device lists the size it sets. */
export const PresetsOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Screen' }));
    const option = await screen.findByRole('option', { name: /iPhone/ });
    await waitFor(() => expect(option).toBeVisible());
  },
};

export const SeveralVariants: Story = { args: { captured: null } };
