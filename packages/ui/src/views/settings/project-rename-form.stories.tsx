import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProjectRenameForm } from './project-rename-form';

const meta = {
  title: 'Views/Settings/Project name',
  component: ProjectRenameForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { name: 'Web shop', action: fn() },
} satisfies Meta<typeof ProjectRenameForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Submits `name` with the hidden fields the app passes in. */
export const Default: Story = {
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
    const input = canvas.getByLabelText('Project name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Storefront');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    await expect(Object.fromEntries(data)).toEqual({ team: 'acme', project: 'web', name: 'Storefront' });
  },
};

export const Saving: Story = { args: { pending: true } };
export const WithError: Story = { args: { error: 'A project needs a name.' } };
