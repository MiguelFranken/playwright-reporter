import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProjectDangerZone } from './project-danger-zone';

const meta = {
  title: 'Views/Settings/Danger zone',
  component: ProjectDangerZone,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { name: 'Web shop', slug: 'web', open: false, onOpenChange: fn(), onDelete: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectDangerZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Delete project' }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
  },
};

export const Confirming: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Delete Web shop' }));
    await userEvent.type(d.getByLabelText('Project slug'), 'web');
    await userEvent.click(d.getByRole('button', { name: 'Delete project' }));
    await expect(args.onDelete).toHaveBeenCalledWith('web');
  },
};

export const Deleting: Story = { args: { open: true, pending: true } };
