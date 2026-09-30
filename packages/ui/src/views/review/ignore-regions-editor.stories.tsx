import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { placeOrderFlow } from '../../fixtures/review';
import { IgnoreRegionsEditor } from './ignore-regions-editor';

const mobile = placeOrderFlow.checkpoints[1].captures[1];

const meta = {
  title: 'Views/Review/Diff/IgnoreRegionsEditor',
  component: IgnoreRegionsEditor,
  args: {
    image: mobile.image,
    imageSize: { width: 780, height: 3800 },
    frame: { width: 390, height: 844 },
    zoom: 0.6,
    alt: 'Checkout filled in, mobile',
    value: mobile.ignoreRegions!,
    onSave: fn(),
    onCancel: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof IgnoreRegionsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One area left out; removing it and saving hands the host the new list. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('700 × 120 px at 40, 280')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove area 1' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onSave).toHaveBeenCalledWith([]);
  },
};

/** Drawing on the image adds an area, in the image's own pixels. */
export const Draw: Story = {
  args: { value: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const img = canvas.getByRole('img', { name: 'Checkout filled in, mobile' });
    const box = img.getBoundingClientRect();
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: img, coords: { clientX: box.left + 10, clientY: box.top + 10 } },
      { target: img, coords: { clientX: box.left + 60, clientY: box.top + 40 } },
      { keys: '[/MouseLeft]', target: img, coords: { clientX: box.left + 60, clientY: box.top + 40 } },
    ]);
    await expect(canvas.getByRole('list', { name: 'Areas left out' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

export const Empty: Story = { args: { value: [] } };

export const Saving: Story = { args: { pending: true } };
