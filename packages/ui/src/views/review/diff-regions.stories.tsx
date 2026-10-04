import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { checkoutDesktopDiff } from '../../fixtures/review';
import { DiffRegionList, VisualDiffAiActions, comparisonIdOf } from './diff-regions';

function Hosted(props: Omit<React.ComponentProps<typeof DiffRegionList>, 'active' | 'onSelect'> & { onSelect?: (i: number) => void }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <DiffRegionList
      {...props}
      active={active}
      onSelect={(i) => {
        setActive(i);
        props.onSelect?.(i);
      }}
    />
  );
}

const meta = {
  title: 'Views/Review/Diff/DiffRegionList',
  component: Hosted,
  args: { regions: checkoutDesktopDiff.regions, onSelect: fn() },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two regions, D1 and D2 in reading order; selecting one tells the host. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Changed regions' });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: /D2/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(1);
    await expect(canvas.getByRole('button', { name: /D2/ })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** An area left out covers the first region wholly and the second in part. */
export const WithIgnoredAreas: Story = {
  args: {
    ignored: [
      { x: 2200, y: 40, width: 300, height: 80 },
      { x: 1500, y: 900, width: 100, height: 200 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('left out')).toBeInTheDocument();
    await expect(canvas.getByText('partly left out')).toBeInTheDocument();
  },
};

const BASE = '3b1f5e8a-3c4d-4e6f-8a9b-0c1d2e3f4a5b';
const HEAD = '9f0e1d2c-3b4a-4596-8778-695a4b3c2d1e';

/** The hand-off menus name the comparison of the two captures; the fix prompt names the selected region alone. */
export const AiActions: StoryObj<typeof VisualDiffAiActions> = {
  render: (args) => <VisualDiffAiActions {...args} />,
  args: { comparisonId: comparisonIdOf(BASE, HEAD)!, regions: checkoutDesktopDiff.regions, active: 1, project: 'acme/web', screen: 'Checkout › Checkout filled in (desktop)', setupHref: '#connect' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Investigate with AI' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Fix cause of D2 with AI' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Copy prompt' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
};
