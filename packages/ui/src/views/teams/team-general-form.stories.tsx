import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TeamGeneralForm } from './team-general-form';

const meta = {
  title: 'Views/Teams/General',
  component: TeamGeneralForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { name: 'Acme', slug: 'acme', onSubmit: fn() },
} satisfies Meta<typeof TeamGeneralForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Save arms once something changed; the URL preview follows the slug. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    const slug = canvas.getByLabelText('Slug');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'acme-inc');
    await expect(canvas.getByText(/\/teams\/acme-inc/)).toBeVisible();
    await userEvent.click(save);
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme-inc' });
  },
};

export const Saving: Story = { args: { pending: true } };
