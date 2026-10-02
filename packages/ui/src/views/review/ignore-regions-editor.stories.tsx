import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { placeOrderFlow } from '../../fixtures/review';
import type { IgnoreRule } from '../../lib/visual-diff';
import { IgnoreRegionsEditor } from './ignore-regions-editor';

const mobile = placeOrderFlow.checkpoints[1].captures[1];

const rules: IgnoreRule[] = [
  {
    id: 'rule-clock',
    x: 40,
    y: 280,
    width: 700,
    height: 120,
    reason: 'The order time is live.',
    category: 'time_dependent',
    source: 'manual',
    active: true,
    createdAt: '2026-09-28T09:12:00.000Z',
    createdBy: 'Ada Lovelace',
    geometry: { imageWidth: 780, imageHeight: 3800, originCaptureId: 'cap-1', viewportWidth: 390, viewportHeight: 844, deviceScaleFactor: 2 },
  },
];

const meta = {
  title: 'Views/Review/Diff/IgnoreRegionsEditor',
  component: IgnoreRegionsEditor,
  args: {
    captureId: mobile.id,
    image: mobile.image,
    imageSize: { width: 780, height: 3800 },
    frame: { width: 390, height: 844 },
    zoom: 0.6,
    alt: 'Checkout filled in, mobile',
    rules,
    revision: 3,
    onSave: fn(),
    onCancel: fn(),
    onPreview: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof IgnoreRegionsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One rule with its reason and origin; removing it and saving hands the host the empty set with the revision it started from. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('700 × 120 px at 40, 280')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Reason for area 1')).toHaveValue('The order time is live.');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove area 1' }));
    await userEvent.type(canvas.getByLabelText('Reason for this change'), 'Clock frozen in the test');
    await userEvent.click(canvas.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onSave).toHaveBeenCalledWith({ captureId: mobile.id, rules: [], reason: 'Clock frozen in the test', expectedRevision: 3 });
  },
};

/** Drawing on the image adds a rule, in the image's own pixels, and asks the host for a preview. */
export const Draw: Story = {
  args: { rules: [], revision: 0 },
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
    await userEvent.type(canvas.getByLabelText('Reason for area 1'), 'Random booking name');
    await userEvent.click(canvas.getByRole('button', { name: 'Save and measure again' }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    const change = (args.onSave as ReturnType<typeof fn>).mock.calls[0]![0] as { rules: { reason: string | null; id: string | null }[] };
    await expect(change.rules[0]).toMatchObject({ id: null, reason: 'Random booking name' });
  },
};

/** A switch keeps a rule but turns it off; the preview says what the active ones leave out. */
export const SwitchedOffWithPreview: Story = {
  args: { preview: { pending: false, result: { rawChangedPixels: 1240, suppressedPixels: 1180, remainingPixels: 60, remainingRegions: 1, ignoredAreaPercent: 2.8, sizeChanged: false } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/60 remaining/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Area 1 switched on' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save and measure again' }));
    const change = (args.onSave as ReturnType<typeof fn>).mock.calls[0]![0] as { rules: { active: boolean; id: string }[] };
    await expect(change.rules[0]).toMatchObject({ id: 'rule-clock', active: false });
  },
};

/** A rule drawn on an image of another size is suspended here, and says so. */
export const GeometryChanged: Story = {
  args: { imageSize: { width: 780, height: 4200 }, rules: [{ ...rules[0], geometry: { ...rules[0].geometry!, imageHeight: 3800 } }] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Drawn on an image of another size/)).toBeInTheDocument();
  },
};

/** The rectangles cover too much of the image: the preview warns. */
export const TooWide: Story = {
  args: { preview: { pending: false, result: { rawChangedPixels: 1240, suppressedPixels: 1240, remainingPixels: 0, remainingRegions: 0, ignoredAreaPercent: 24.5, sizeChanged: false } } },
};

export const Empty: Story = { args: { rules: [], revision: 0 } };

export const Saving: Story = { args: { pending: true } };

export const Measuring: Story = { args: { preview: { pending: true, result: null } } };
