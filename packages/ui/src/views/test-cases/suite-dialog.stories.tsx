import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { suiteOptions } from '../../fixtures/test-cases';
import { SuiteDialog } from './suite-dialog';

const meta = {
  title: 'Views/TestCases/SuiteDialog',
  component: SuiteDialog,
  tags: ['themed'],
  args: {
    open: true,
    onOpenChange: fn(),
    mode: 'create',
    initial: { name: '', description: '', parentId: 's-checkout' },
    parents: suiteOptions,
    onSubmit: fn(),
  },
} satisfies Meta<typeof SuiteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'New suite' }));
    await expect(d.getByRole('button', { name: 'Create suite' })).toBeDisabled();
    await userEvent.type(d.getByLabelText('Name'), '  Coupons ');
    await userEvent.click(d.getByRole('button', { name: 'Create suite' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Coupons', description: '', parentId: 's-checkout' });
  },
};

export const Edit: Story = { args: { mode: 'edit', initial: { name: 'Checkout', description: 'Cart, payment and the order confirmation.', parentId: null } } };

export const Failed: Story = { args: { initial: { name: 'Seventh level', description: '', parentId: 's-cards' }, error: 'Suites nest at most 6 levels deep.' } };

export const Pending: Story = { args: { initial: { name: 'Coupons', description: '', parentId: null }, pending: true } };
