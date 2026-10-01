import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ago } from '../../fixtures/now';
import type { AnalysisView } from '../../lib/visual-diff';
import { AnalysisPanel } from './analysis-panel';

const done: AnalysisView = {
  id: 'an-1',
  status: 'done',
  model: 'google/gemini-3.8-flash',
  createdAt: ago(12).toISOString(),
  finishedAt: ago(11).toISOString(),
  summary: 'The booking name differs between the two runs; the price and the layout beside it are unchanged.',
  error: null,
  reservedMicroUsd: 9_750,
  actualMicroUsd: 4_120,
  suggestions: [
    {
      id: 'sg-1',
      regionId: 'r2272-52-160-40',
      regionLabel: 'D1',
      observation: 'A different customer name at the same place; the row and the total beside it read the same.',
      hypothesis: 'dynamic_text',
      alternatives: ['Another test user signed in', 'A different sort order of bookings'],
      recommendation: 'consider_ignore',
      uncertainty: 'medium',
      proposedRects: [{ x: 2280, y: 58, width: 140, height: 28 }],
      effect: { rawChangedPixels: 5800, suppressedPixels: 5600, remainingPixels: 200 },
      decision: 'open',
    },
    {
      id: 'sg-2',
      regionId: 'r1296-940-400-88',
      regionLabel: 'D2',
      observation: 'The primary button is red where it was blue.',
      hypothesis: 'real_change',
      alternatives: [],
      recommendation: 'investigate',
      uncertainty: 'low',
      proposedRects: [],
      effect: null,
      decision: 'open',
    },
  ],
};

const meta = {
  title: 'Views/Review/Diff/AnalysisPanel',
  component: AnalysisPanel,
  args: { allowed: true, mode: 'manual', analyses: [done], onAnalyze: fn(), onDecide: fn(), onEditRects: fn(), onFocusRegion: fn() },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof AnalysisPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One analysis done: a dynamic name with a tight proposal, and a real change the model would investigate. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole('list', { name: 'Suggestions' })).getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.getByText(/5,600 of 5,800 changed px/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Accept as a rule' }));
    await expect(args.onDecide).toHaveBeenCalledWith({ suggestionId: 'sg-1', decision: 'accepted' });
    await userEvent.click(canvas.getByRole('button', { name: 'Adjust first' }));
    await expect(args.onEditRects).toHaveBeenCalledWith([{ x: 2280, y: 58, width: 140, height: 28 }]);
    await userEvent.click(canvas.getByRole('button', { name: 'Show region D2' }));
    await expect(args.onFocusRegion).toHaveBeenCalledWith('r1296-940-400-88');
  },
};

/** Nothing analysed yet; the button starts one. */
export const Empty: Story = {
  args: { analyses: [] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Suggest dynamic areas' }));
    await expect(args.onAnalyze).toHaveBeenCalled();
  },
};

export const Running: Story = { args: { analyses: [{ ...done, status: 'running', summary: null, actualMicroUsd: null, suggestions: [] }] } };

export const Failed: Story = { args: { analyses: [{ ...done, status: 'failed', error: 'The model call failed: gateway timeout', summary: null, suggestions: [] }] } };

/** The project denies AI for this folder: the button says why. */
export const NotAllowed: Story = { args: { allowed: false, reason: 'AI analysis is not allowed for this screen: Denied by the spec file or folder rule.', analyses: [] } };

export const OverBudget: Story = { args: { analyses: [{ ...done, status: 'over_budget', error: "The team's monthly AI budget would be exceeded: $9.9960 spent or reserved, $0.0098 asked for, $10.0000 allowed.", summary: null, suggestions: [], actualMicroUsd: null }] } };

/** A suggestion a person accepted, and one rejected. */
export const Decided: Story = {
  args: { analyses: [{ ...done, suggestions: [{ ...done.suggestions[0], decision: 'accepted' }, { ...done.suggestions[0], id: 'sg-3', regionLabel: 'D3', decision: 'rejected' }] }] },
};
