import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { PENDING_STATE_A11Y } from '../fixtures/a11y';
import { Button } from '../components/button';
import {
  FilterSelect,
  FilterSelectSkeleton,
  RangeToggle,
  RangeToggleSkeleton,
  SearchField,
  SearchFieldSkeleton,
} from './filter-controls';

/**
 * Every one of these is controlled. In the app a three-line `Url*` wrapper binds
 * it to `useSearchParams`; here the stories bind it to `useState`, which is the
 * whole point of the split.
 */
// The file documents the whole family, but the meta names RangeToggle so the
// stories get typed args and a docgen table for at least the representative
// control; the others drive themselves from their own `render`.
const meta = {
  title: 'Patterns/FilterControls',
  component: RangeToggle,
  args: { value: '30', onValueChange: fn() },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RangeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

const BRANCHES = [
  { value: 'main', label: 'main' },
  { value: 'develop', label: 'develop' },
  { value: 'feature/checkout-guest-cart', label: 'feature/checkout-guest-cart' },
];

export const Range: Story = {
  render: function Render() {
    const [value, setValue] = useState('30');
    return <RangeToggle value={value} onValueChange={(next) => setValue(next ?? 'all')} />;
  },
};

export const RangeWithAll: Story = {
  render: function Render() {
    const [value, setValue] = useState('all');
    return <RangeToggle allowAll value={value} onValueChange={(next) => setValue(next ?? 'all')} />;
  },
};

export const Select_: Story = {
  name: 'Select',
  render: function Render() {
    const [value, setValue] = useState('all');
    return (
      <FilterSelect
        value={value}
        options={BRANCHES}
        placeholder="Branch"
        allLabel="All branches"
        onValueChange={(next) => setValue(next ?? 'all')}
      />
    );
  },
};

export const Search: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="flex flex-col gap-2">
        <SearchField value={value} placeholder="Search tests…" onValueChange={(next) => setValue(next ?? '')} />
        <p className="text-body-xs text-muted-foreground">Committed value: {value || '(none)'}</p>
      </div>
    );
  },
};

/**
 * `fill` drops the 18rem resting width, for a column too narrow to hold it —
 * the field then takes exactly the room its container gives it.
 */
export const SearchFilling: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <div className="flex w-64 items-center gap-2">
        <SearchField fill className="min-w-0 flex-1" value={value} placeholder="Search specs…" onValueChange={(next) => setValue(next ?? '')} />
        <Button variant="outline">Filter</Button>
      </div>
    );
  },
};

/** How a filter bar actually looks assembled, including the pending dimming. */
export const Bar: Story = {
  render: function Render() {
    const [range, setRange] = useState('30');
    const [branch, setBranch] = useState('all');
    const [query, setQuery] = useState('');
    return (
      <div className="flex flex-wrap items-center gap-2">
        <RangeToggle value={range} onValueChange={(n) => setRange(n ?? 'all')} />
        <FilterSelect value={branch} options={BRANCHES} placeholder="Branch" onValueChange={(n) => setBranch(n ?? 'all')} />
        <SearchField value={query} placeholder="Search tests…" onValueChange={(n) => setQuery(n ?? '')} />
      </div>
    );
  },
};

/** What a control looks like while a navigation transition is in flight. */
export const Pending: Story = {
  parameters: PENDING_STATE_A11Y,
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <RangeToggle isPending value="30" onValueChange={fn()} />
      <FilterSelect isPending value="all" options={BRANCHES} placeholder="Branch" onValueChange={fn()} />
      <SearchField isPending value="cart" onValueChange={fn()} />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <RangeToggleSkeleton />
      <FilterSelectSkeleton />
      <SearchFieldSkeleton />
    </div>
  ),
};

export const RangeReportsChanges: Story = {
  render: function Render() {
    const [value, setValue] = useState('30');
    return <RangeToggle value={value} onValueChange={(next) => setValue(next ?? 'all')} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Last 7 days' }));
    await expect(canvas.getByRole('radio', { name: 'Last 7 days' })).toBeChecked();
  },
};

/** "All" clears the filter, so the control reports null rather than the string. */
export const AllClearsTheFilter: Story = {
  render: (args) => <RangeToggle allowAll value="30" onValueChange={args.onValueChange} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('radio', { name: 'All time' }));
    await expect(args.onValueChange).toHaveBeenCalledWith(null);
  },
};

/**
 * The field keeps its own draft and only reports on submit, so a host bound to
 * the URL does not push a history entry per keystroke.
 */
export const SearchCommitsOnSubmit: Story = {
  render: (args) => <SearchField value="" placeholder="Search tests…" onValueChange={args.onValueChange} />,
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('searchbox', { name: /search tests/i });

    await userEvent.type(input, 'guest cart');
    await expect(args.onValueChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('guest cart');
  },
};

/** Clearing reports null — an empty string would filter for "" rather than nothing. */
export const SearchClears: Story = {
  render: (args) => <SearchField value="cart" onValueChange={args.onValueChange} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /clear search/i }));
    await expect(args.onValueChange).toHaveBeenCalledWith(null);
  },
};
