import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DefaultBranchForm } from './default-branch-form';

const meta = {
  title: 'Views/Settings/Default branch',
  component: DefaultBranchForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { value: '', fallback: 'main', action: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DefaultBranchForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing configured: the placeholder and the help text name the fallback. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Base branch')).toHaveAttribute('placeholder', 'main');
    await expect(canvas.getByText(/Leave empty to use main\./)).toBeVisible();
  },
};

export const Configured: Story = { args: { value: 'develop' } };

/** Submits `defaultBranch` along with the hidden fields the app passes in. */
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
    await userEvent.type(canvas.getByLabelText('Base branch'), 'release/2026.09');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    await expect(Object.fromEntries(data)).toEqual({ team: 'acme', project: 'web', defaultBranch: 'release/2026.09' });
  },
};

export const Saving: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  },
};

export const WithError: Story = { args: { value: 'feature/x', error: 'Branch names cannot contain spaces.' } };
