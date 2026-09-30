import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fieldDefs } from '../../fixtures/test-cases';
import { FieldSettings } from './field-settings';

const meta = {
  title: 'Views/TestCases/FieldSettings',
  component: FieldSettings,
  args: { defs: fieldDefs.slice(0, 2), onSave: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FieldSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new field's key follows its label until the key is edited. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: 'Add field' }));
    await userEvent.type(c.getByLabelText('Label', { selector: '#field-2-label' }), 'Sprint goal');
    await expect(c.getByLabelText('Key', { selector: '#field-2-key' })).toHaveValue('sprint_goal');
    await userEvent.click(c.getByRole('button', { name: 'Remove field 1' }));
    await userEvent.click(c.getByRole('button', { name: 'Save fields' }));
    await expect(args.onSave).toHaveBeenCalledWith([
      { key: 'area', label: 'Product area', kind: 'select', required: false, options: ['Accounts', 'Checkout', 'Search'] },
      { key: 'sprint_goal', label: 'Sprint goal', kind: 'text', required: false, options: [] },
    ]);
  },
};

export const Empty: Story = { args: { defs: [] } };

export const Every: Story = { args: { defs: fieldDefs } };

export const Failed: Story = { args: { error: 'Two fields share a key.' } };

export const ReadOnly: Story = { args: { canEdit: false } };
