import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { PolicyRule } from '../../lib/visual-diff';
import { VisualPolicyForm } from './visual-policy-form';

const rules: PolicyRule[] = [
  { id: 'r1', scope: { kind: 'file', path: 'tests/checkout' }, capability: 'ai', effect: 'deny' },
  { id: 'r2', scope: { kind: 'suite', suiteId: 's1', name: 'Payments' }, capability: 'ignore', effect: 'deny' },
  { id: 'r3', scope: { kind: 'screen', testId: 't1', checkpointName: 'booking-summary' }, capability: 'ai', effect: 'allow' },
];

const meta = {
  title: 'Views/Settings/General/Visual policies',
  component: VisualPolicyForm,
  parameters: { layout: 'padded' },
  args: {
    rules,
    ai: { mode: 'manual', model: 'google/gemini-3.8-flash', monthlyBudgetMicroUsd: 3_000_000, perJobMaxMicroUsd: 50_000 },
    choices: {
      suites: [
        { id: 's1', name: 'Payments' },
        { id: 's2', name: 'Catalogue' },
      ],
      tests: [
        { id: 't1', title: 'books a workshop', file: 'tests/booking.spec.ts' },
        { id: 't2', title: 'applies a coupon', file: 'tests/coupon.spec.ts' },
      ],
      models: ['google/gemini-3.8-flash', 'google/gemini-2.5-flash-lite'],
    },
    spentThisMonthMicroUsd: 412_000,
    action: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VisualPolicyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three rules: a folder denied AI, a suite denied rules, a screen allowed AI (which the folder's deny still beats). */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole('list', { name: 'Policy rules' })).getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getByText(/\$0\.41 spent or reserved/)).toBeInTheDocument();
  },
};

/** Adding a folder rule and saving posts the whole list as JSON beside the AI settings. */
export const AddsARule: Story = {
  args: { rules: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Spec file or folder'), 'tests/payments');
    await userEvent.click(canvas.getByRole('button', { name: 'Add rule' }));
    await expect(within(canvas.getByRole('list', { name: 'Policy rules' })).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    const posted = JSON.parse(String(data.get('rules'))) as PolicyRule[];
    await expect(posted[0]).toMatchObject({ scope: { kind: 'file', path: 'tests/payments' }, capability: 'ai', effect: 'deny' });
    await expect(Object.fromEntries(data)).toMatchObject({ aiMode: 'manual', aiMonthlyBudgetUsd: '3', aiPerJobMaxUsd: '0.05' });
  },
};

export const ReadOnly: Story = { args: { disabled: true } };

/** No gateway key on this deployment: analyses cannot run, the settings still save. */
export const AiUnavailable: Story = { args: { aiUnavailableReason: 'This deployment has no AI gateway key (AI_GATEWAY_API_KEY): analyses cannot run here. The settings apply where it does.', ai: { mode: 'off', model: null, monthlyBudgetMicroUsd: null, perJobMaxMicroUsd: 50_000 } } };

export const Saving: Story = { args: { pending: true } };

export const WithError: Story = { args: { error: 'The model is not on this deployment’s allow list.' } };
