import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { ImportDialog } from './import-dialog';

const meta = {
  title: 'Views/TestCases/ImportDialog',
  component: ImportDialog,
  tags: ['themed'],
  args: { open: true, onOpenChange: fn(), action: fn() },
} satisfies Meta<typeof ImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async () => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Import test cases' }));
    await expect(d.getByLabelText('File (JSON or CSV, up to 4 MB)')).toHaveAttribute('name', 'file');
  },
};

export const Imported: Story = {
  args: { summary: { created: 12, updated: 0, skipped: 3, suites: 2, errors: ['Row 7: A test case needs a title.'] } },
};

export const Failed: Story = { args: { error: 'That file is neither JSON nor CSV.' } };

export const Pending: Story = { args: { pending: true } };
