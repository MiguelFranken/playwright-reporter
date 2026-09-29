import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NOW } from '../../fixtures/now';
import { automatedTests, suiteOptions } from '../../fixtures/test-cases';
import { TestPickerDialog } from './test-picker-dialog';

const meta = {
  title: 'Views/TestCases/TestPickerDialog',
  component: TestPickerDialog,
  tags: ['themed'],
  args: {
    open: true,
    onOpenChange: fn(),
    mode: 'link',
    title: 'Link Playwright tests to TC-1',
    description: 'Linked tests report their results on the case and mark it automated.',
    query: '',
    onQueryChange: fn(),
    options: automatedTests,
    total: 4,
    onConfirm: fn(),
    now: NOW,
  },
} satisfies Meta<typeof TestPickerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Link: Story = {
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog'));
    await userEvent.click(d.getByRole('checkbox', { name: /applies a coupon/ }));
    await userEvent.type(d.getByRole('searchbox', { name: 'Search tests by title or file' }), 'cart{Enter}');
    await expect(args.onQueryChange).toHaveBeenCalledWith('cart');
    await userEvent.click(d.getByRole('button', { name: 'Link 1 test' }));
    await expect(args.onConfirm).toHaveBeenCalledWith({ testIds: ['a3'], placement: { mode: 'mirror' } });
  },
};

/** Tests that already back a case cannot be adopted again. */
export const Adopt: Story = {
  args: { mode: 'adopt', title: 'Adopt Playwright tests', description: 'Each test becomes a case, already linked.', suites: suiteOptions },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog'));
    await expect(d.getByRole('checkbox', { name: /logs in with a password/ })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(d.getByRole('checkbox', { name: 'Select every test shown' }));
    await userEvent.click(d.getByRole('button', { name: 'Adopt 2 tests' }));
    await expect(args.onConfirm).toHaveBeenCalledWith({ testIds: ['a1', 'a2'], placement: { mode: 'mirror' } });
  },
};

export const Loading: Story = { args: { options: [], total: 0, loading: true } };

export const NothingToAdopt: Story = { args: { mode: 'adopt', options: [], total: 0 } };

export const NoMatch: Story = { args: { options: [], total: 0, query: 'checkout' } };

export const LoadFailed: Story = { args: { options: [], total: 0, error: 'The tests could not be loaded. Try again.' } };

export const Pending: Story = { args: { pending: true } };

/** Long titles, files and a long description stay inside the dialog: titles truncate, nothing scrolls sideways. */
export const LongContent: Story = {
  args: {
    mode: 'adopt',
    title: 'Adopt Playwright tests',
    description:
      'Each test becomes a test case that is already linked to it: its title, its test.step()s as steps, and suites named after its file and describe blocks. The same test in several browsers becomes one case.',
    suites: suiteOptions,
    options: [
      ...automatedTests,
      {
        testId: 'a5',
        title: 'sends a reminder for a partially used coupon with more than €10 remaining after the second purchase in the same month',
        titlePath: ['coupons', 'reminders', 'sends a reminder'],
        file: 'tests/checkout/coupons/reminders/coupon-reminder-for-partially-used-coupons.spec.ts',
        pwProject: 'mobile-safari-landscape',
        lastRunAt: automatedTests[0]!.lastRunAt,
        lastOutcome: 'passed',
        linkedCases: [],
      },
    ],
    total: 5,
  },
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    for (const el of dialog.querySelectorAll('*')) {
      await expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(dialog.getBoundingClientRect().right + 0.5);
    }
  },
};
