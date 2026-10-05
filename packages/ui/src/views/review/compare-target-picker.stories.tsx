import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { checkoutCompareTargets, NOW, placeOrderFlow } from '../../fixtures/review';
import { resolveCompare, type CompareRule } from '../../lib/review';
import { CompareTargetPicker } from './compare-target-picker';

const capture = placeOrderFlow.checkpoints[1].captures[0];
const firstCapture = placeOrderFlow.checkpoints[2].captures[0];

/** Controlled like the viewer controls it: the rule picks the reference, whose label the trigger shows. */
function Hosted(props: Omit<React.ComponentProps<typeof CompareTargetPicker>, 'rule' | 'onRuleChange' | 'referenceLabel'> & { initial?: CompareRule; onRuleChange?: (next: CompareRule) => void }) {
  const { initial = 'auto', onRuleChange, ...rest } = props;
  const [rule, setRule] = useState<CompareRule>(initial);
  const resolved = resolveCompare(rest.capture, rule, rest.targets);
  const fallback = rest.capture.baseline ? `Approved (#${rest.capture.baseline.runNumber})` : rest.capture.previous ? `Run #${rest.capture.previous.runNumber}` : null;
  return (
    <CompareTargetPicker
      {...rest}
      rule={rule}
      referenceLabel={resolved.target?.label ?? fallback}
      onRuleChange={(next) => {
        setRule(next);
        onRuleChange?.(next);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Viewer/CompareTargetPicker',
  component: Hosted,
  args: { capture, targets: checkoutCompareTargets, now: NOW, onRuleChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Automatic compares with the approved baseline; the runs with open comments come first, then the others. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox', { name: 'Compare with' });
    await expect(trigger).toHaveTextContent('vs. Approved (#470)');
    await userEvent.click(trigger);
    await expect(await screen.findByRole('group', { name: 'Open comments' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: /Run #477/ }));
    await expect(args.onRuleChange).toHaveBeenLastCalledWith('run:477');
    await waitFor(() => expect(trigger).toHaveTextContent('vs. Run #477'));
    // The list animates out; the trigger takes a click again once it has gone.
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /Latest open comments/ }));
    await expect(args.onRuleChange).toHaveBeenLastCalledWith('comments');
    await waitFor(() => expect(trigger).toHaveTextContent('vs. Run #479'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  },
};

/** Open: what each rule would pick, and the last runs that captured the screen. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare with' }));
    const option = await screen.findByRole('option', { name: /Run #468/ });
    await waitFor(() => expect(option).toBeVisible());
  },
};

/** The run before, picked once: it stays the rule while the reviewer moves on. */
export const RunBefore: Story = { args: { initial: 'previous' } };

/** The other runs are still loading: placeholders stand in for them, and the rules that need them wait. */
export const Loading: Story = {
  args: { targets: undefined },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Compare with' }));
    const placeholders = await screen.findAllByRole('option', { name: 'Loading the other runs…' });
    await expect(placeholders).toHaveLength(3);
    for (const p of placeholders) await expect(p).toHaveAttribute('aria-disabled', 'true');
    await expect(await screen.findByRole('group', { name: 'Other runs' })).toBeInTheDocument();
  },
};

/** Loaded on demand, as the app does: nothing is asked for until the reviewer reaches for the list. */
function OnDemand(props: React.ComponentProps<typeof Hosted> & { delay?: number }) {
  const { delay = 400, onTargetsWanted, targets: loaded, ...rest } = props;
  const [targets, setTargets] = useState<typeof loaded>(undefined);
  const [asked, setAsked] = useState(false);
  return (
    <Hosted
      {...rest}
      targets={targets}
      onTargetsWanted={() => {
        onTargetsWanted?.();
        if (asked) return;
        setAsked(true);
        setTimeout(() => setTargets(loaded), delay);
      }}
    />
  );
}

export const LoadedOnOpen: Story = {
  args: { onTargetsWanted: fn() },
  render: (args) => <OnDemand {...args} />,
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole('combobox', { name: 'Compare with' });
    await expect(args.onTargetsWanted).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await expect(args.onTargetsWanted).toHaveBeenCalled();
    await expect((await screen.findAllByRole('option', { name: 'Loading the other runs…' })).length).toBeGreaterThan(0);
    // The runs replace the placeholders once they arrive.
    await expect(await screen.findByRole('option', { name: /Run #468/ }, { timeout: 3000 })).toBeInTheDocument();
    await expect(screen.queryByRole('option', { name: 'Loading the other runs…' })).not.toBeInTheDocument();
  },
};

/** The first capture of a screen, or every other run's image has been deleted: nothing approved, no run before, no other run. */
export const NothingToCompare: Story = {
  args: { capture: { ...firstCapture, previous: null, baseline: null }, targets: [] },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox', { name: 'Compare with' });
    await expect(trigger).toHaveTextContent('vs. Nothing yet');
    await userEvent.click(trigger);
    await expect(await screen.findByText('No other run still has an image of this screen.')).toBeInTheDocument();
    await expect(await screen.findByRole('option', { name: /Approved baseline/ })).toHaveAttribute('aria-disabled', 'true');
  },
};
