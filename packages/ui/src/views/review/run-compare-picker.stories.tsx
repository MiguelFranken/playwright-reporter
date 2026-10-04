import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { NOW, runCompareTargets } from '../../fixtures/review';
import type { CompareRule } from '../../lib/review';
import { RunComparePicker } from './run-compare-picker';

/** Controlled like the run review controls it, through `?against=`. */
function Hosted(props: Omit<React.ComponentProps<typeof RunComparePicker>, 'rule' | 'onRuleChange'> & { initial?: CompareRule; onRuleChange?: (next: CompareRule) => void }) {
  const { initial = 'auto', onRuleChange, ...rest } = props;
  const [rule, setRule] = useState<CompareRule>(initial);
  return (
    <RunComparePicker
      {...rest}
      rule={rule}
      onRuleChange={(next) => {
        setRule(next);
        onRuleChange?.(next);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Storyboard/RunComparePicker',
  component: Hosted,
  args: { targets: runCompareTargets, now: NOW, onRuleChange: fn(), onTargetsWanted: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Automatic by default; picking a run compares every screen with it. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole('combobox', { name: 'Compare the run with' });
    await expect(trigger).toHaveTextContent('vs. Automatic');
    await userEvent.click(trigger);
    await expect(args.onTargetsWanted).toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('option', { name: /Run #479/ }));
    await expect(args.onRuleChange).toHaveBeenLastCalledWith('run:479');
    await waitFor(() => expect(trigger).toHaveTextContent('vs. Run #479'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /Run before/ }));
    await expect(args.onRuleChange).toHaveBeenLastCalledWith('previous');
    await waitFor(() => expect(trigger).toHaveTextContent('vs. Run before'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  },
};

/** Open: the rules, then the newest runs with their branch, commit, age and how many of the screens they hold. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' }));
    const option = await screen.findByRole('option', { name: /Run #468/ });
    await waitFor(() => expect(option).toBeVisible());
    await expect(screen.getByRole('option', { name: /Run #470/ })).toHaveTextContent('1 screen');
  },
};

/** A run chosen, from a shared link. */
export const RunChosen: Story = { args: { initial: 'run:477' } };

/** A run older than the list, from a shared link: it is still shown as chosen. */
export const OlderRunChosen: Story = {
  args: { initial: 'run:12' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' }));
    await expect(await screen.findByRole('option', { name: 'Run #12', selected: true })).toBeInTheDocument();
  },
};

/** The review under the new rule is loading: the screens still show the comparison before. */
export const Pending: Story = {
  args: { initial: 'run:481', pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' })).toHaveAttribute('aria-busy', 'true');
  },
};

/** The other runs are still loading: placeholders stand in for them. */
export const Loading: Story = {
  args: { targets: undefined },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' }));
    const placeholders = await screen.findAllByRole('option', { name: 'Loading the other runs…' });
    await expect(placeholders).toHaveLength(3);
  },
};

/** No other run kept images of these screens: only the rules are offered. */
export const NoOtherRuns: Story = {
  args: { targets: [] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' }));
    await expect(await screen.findByRole('option', { name: /No other run/ })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** A per-image rule picked in the viewer shows here as it is. */
export const PerImageRule: Story = {
  args: { initial: 'comments' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Compare the run with' })).toHaveTextContent('vs. Latest open comments');
  },
};
