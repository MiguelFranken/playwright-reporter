import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { VisualDiffForm } from './visual-diff-form';

const meta = {
  title: 'Views/Settings/General/Visual comparison',
  component: VisualDiffForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { value: { threshold: 0.1, autoApprove: true, maxChangedPixels: 0, maxChangedPercent: 0 }, action: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VisualDiffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The defaults: only changes nobody can see are approved. */
export const Default: Story = {};

/** Submits every field, the tolerance loosened. */
export const Submits: Story = {
  args: {
    children: (
      <>
        <input type="hidden" name="team" value="acme" />
        <input type="hidden" name="project" value="web" />
      </>
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const pixels = canvas.getByLabelText('Changed pixels allowed');
    await userEvent.clear(pixels);
    await userEvent.type(pixels, '25');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    await expect(Object.fromEntries(data)).toMatchObject({ team: 'acme', project: 'web', maxChangedPixels: '25', maxChangedPercent: '0', threshold: '0.1', autoApprove: 'on' });
  },
};

export const ReadOnly: Story = { args: { disabled: true } };

/** A deployment that measures nothing (a Vercel preview, or `IMAGE_DIFF_DRIVER=none`). */
export const NotMeasured: Story = { args: { inactiveReason: 'This deployment does not measure image comparisons (IMAGE_DIFF_DRIVER is none). The settings apply where it does.' } };

export const Saving: Story = { args: { pending: true } };

export const WithError: Story = { args: { error: 'The threshold is between 0.01 and 0.5.' } };
