import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { suiteOptions } from '../../fixtures/test-cases';
import { BulkBar, BulkEditDialog } from './bulk-actions';

const meta = {
  title: 'Views/TestCases/Library/BulkActions',
  component: BulkBar,
  args: { count: 3, onClear: fn(), onEdit: fn(), onDeprecate: fn(), onDelete: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BulkBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: 'Deprecate' }));
    await expect(args.onDeprecate).toHaveBeenCalled();
    await userEvent.click(c.getByRole('button', { name: 'Clear selection' }));
    await expect(args.onClear).toHaveBeenCalled();
  },
};

export const TooMany: Story = {
  args: { count: 240 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Edit' })).toBeDisabled();
  },
};

/** Only the fields that were changed are sent. */
export const EditDialog: Story = {
  render: (args) => <BulkEditDialog open onOpenChange={fn()} count={args.count} suites={suiteOptions} onSubmit={args.onEdit as never} />,
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Edit 3 test cases' }));
    await expect(d.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    await userEvent.type(d.getByLabelText('Add tags'), 'release-42, @smoke');
    await userEvent.type(d.getByLabelText('Remove tags'), 'legacy');
    await userEvent.click(d.getByRole('button', { name: 'Apply changes' }));
    await expect(args.onEdit).toHaveBeenCalledWith({ addTags: ['release-42', 'smoke'], removeTags: ['legacy'] });
  },
};
