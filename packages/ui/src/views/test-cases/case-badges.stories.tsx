import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { CASE_PRIORITIES, CASE_STATUSES, CASE_VERDICTS } from '../../lib/test-cases';
import { AutomationBadge, CaseStatusBadge, MutedBadge, PriorityIcon, PriorityLabel, VerdictBadge } from './case-badges';

function AllBadges() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {CASE_STATUSES.map((s) => (
          <CaseStatusBadge key={s} status={s} />
        ))}
        <MutedBadge />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {CASE_PRIORITIES.map((p) => (
          <PriorityIcon key={p} priority={p} />
        ))}
        {CASE_PRIORITIES.map((p) => (
          <PriorityLabel key={`l-${p}`} priority={p} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <AutomationBadge automation="manual" linkCount={0} />
        <AutomationBadge automation="planned" linkCount={0} />
        <AutomationBadge automation="automated" linkCount={2} />
        <AutomationBadge automation="automated" linkCount={0} />
        <AutomationBadge automation="automated" linkCount={0} compact />
      </div>
      <div className="flex flex-wrap gap-2">
        {CASE_VERDICTS.map((v) => (
          <VerdictBadge key={v} verdict={v} />
        ))}
        {CASE_VERDICTS.map((v) => (
          <VerdictBadge key={`c-${v}`} verdict={v} compact />
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: 'Views/TestCases/Case/Badges',
  component: AllBadges,
  tags: ['themed'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AllBadges>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every glyph carries its label, so colour is never the only signal. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('img', { name: 'Priority: Critical' })).toBeVisible();
    await expect(c.getAllByText('Automated (unverified)')[0]).toBeVisible();
    await expect(c.getByRole('img', { name: 'Automated (unverified)' })).toBeVisible();
    await expect(c.getByRole('img', { name: 'Failing' })).toBeVisible();
  },
};
