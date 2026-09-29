import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NOW } from '../../fixtures/now';
import { caseVersions, fieldDefs } from '../../fixtures/test-cases';
import { CaseHistory } from './case-history';

const meta = {
  title: 'Views/TestCases/Case/CaseHistory',
  component: CaseHistory,
  tags: ['themed'],
  args: { versions: caseVersions, fieldDefs, now: NOW, canEdit: true, onRestore: fn(), pendingVersion: null },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CaseHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The two newest versions, changed fields only; a test run's change has no author. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    const table = c.getByRole('table');
    await expect(within(table).getByText('Automation')).toBeVisible();
    await expect(within(table).queryByText('Title')).toBeNull();
    await userEvent.click(c.getByRole('button', { name: 'Show all fields' }));
    await expect(within(table).getByText('Title')).toBeVisible();
    await expect(c.getByText(/Changed by a test run/)).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: 'Restore version 2' }));
    await expect(args.onRestore).toHaveBeenCalledWith(2);
  },
};

export const Restoring: Story = { args: { pendingVersion: 2 } };

export const OnlyTheFirstVersion: Story = { args: { versions: caseVersions.slice(-1) } };

export const NoHistory: Story = { args: { versions: [] } };

export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /Restore/ })).toBeNull();
  },
};
