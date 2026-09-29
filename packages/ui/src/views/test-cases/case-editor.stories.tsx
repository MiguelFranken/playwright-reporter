import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { caseDetail, fieldDefs, suiteOptions } from '../../fixtures/test-cases';
import { CaseEditor, EMPTY_CASE, type CaseEditorValues } from './case-editor';

const editing: CaseEditorValues = {
  title: caseDetail.title,
  suiteId: caseDetail.suiteId,
  description: caseDetail.description,
  preconditions: caseDetail.preconditions,
  postconditions: caseDetail.postconditions,
  stepsFormat: caseDetail.stepsFormat,
  steps: caseDetail.steps,
  status: caseDetail.status,
  priority: caseDetail.priority,
  severity: caseDetail.severity,
  type: caseDetail.type,
  behavior: caseDetail.behavior,
  automation: caseDetail.automation,
  muted: caseDetail.muted,
  tags: caseDetail.tags,
  customFields: caseDetail.customFields,
};

const meta = {
  title: 'Views/TestCases/Case/CaseEditor',
  component: CaseEditor,
  tags: ['themed'],
  args: {
    initial: EMPTY_CASE,
    suites: suiteOptions,
    fieldDefs: [],
    onSubmit: fn(),
    onCancel: fn(),
    submitLabel: 'Create test case',
    pendingLabel: 'Creating…',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CaseEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Switching to Gherkin keeps each step's text; tags are split on commas. */
export const Create: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    const submit = c.getByRole('button', { name: 'Create test case' });
    await expect(submit).toBeDisabled();
    await userEvent.type(c.getByLabelText('Title'), 'Apply a coupon at checkout');
    await userEvent.click(c.getByRole('button', { name: 'Add step' }));
    await userEvent.type(c.getByLabelText('Step 1: action'), 'Enter SAVE10');
    await userEvent.type(c.getByLabelText('Expected result'), 'The total drops by 10%');
    await userEvent.click(c.getByRole('radio', { name: 'Gherkin' }));
    await expect(c.getByLabelText('Step 1')).toHaveValue('Enter SAVE10');
    await userEvent.type(c.getByLabelText('Tags'), 'checkout, @promo, checkout');
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Apply a coupon at checkout',
        stepsFormat: 'gherkin',
        tags: ['checkout', 'promo'],
        steps: [expect.objectContaining({ action: 'Enter SAVE10', expected: 'The total drops by 10%' })],
      }),
    );
  },
};

export const Edit: Story = {
  args: { initial: editing, fieldDefs, linkCount: 2, submitLabel: 'Save changes', pendingLabel: 'Saving…' },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByText('2 linked tests keep this case automated.')).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: 'Remove step 1' }));
    await userEvent.click(c.getByRole('button', { name: 'Save changes' }));
    await expect(args.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ steps: caseDetail.steps.slice(1) }));
  },
};

/** A required custom field blocks saving, and says which one. */
export const RequiredFieldMissing: Story = {
  args: { initial: { ...EMPTY_CASE, title: 'A title' }, fieldDefs },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: 'Create test case' })).toBeDisabled();
    await expect(c.getByText('Fill in Owner to save.')).toBeVisible();
    await userEvent.type(c.getByLabelText('Owner (required)'), 'Kim');
    await expect(c.getByRole('button', { name: 'Create test case' })).toBeEnabled();
  },
};

export const UnverifiedAutomation: Story = { args: { initial: { ...EMPTY_CASE, title: 'Claims to be automated', automation: 'automated' } } };

export const ServerError: Story = {
  args: { initial: editing, error: 'TC-1 was changed by someone else in the meantime. Reload it to see their changes.', submitLabel: 'Save changes' },
};

export const Pending: Story = { args: { initial: editing, pending: true, submitLabel: 'Save changes', pendingLabel: 'Saving…' } };
