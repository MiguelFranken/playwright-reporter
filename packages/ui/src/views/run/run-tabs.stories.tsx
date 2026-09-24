import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { PENDING_STATE_A11Y } from '../../fixtures/a11y';
import { RunTabs } from './run-tabs';
import type { RunTab } from '../../lib/run-tab';

const meta = {
  title: 'Views/Run/RunTabs',
  component: RunTabs,
  args: {
    value: 'summary',
    onValueChange: fn(),
    counts: { summary: 240, errors: 3 },
    children: <p className="text-body-s text-muted-foreground">The active tab&rsquo;s body renders here.</p>,
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Counts are optional per tab — Configuration never has one. */
export const WithoutCounts: Story = { args: { counts: undefined } };

export const OnErrorsTab: Story = { args: { value: 'errors' } };

/** While the host's navigation transition is in flight. */
export const Pending: Story = { args: { isPending: true }, parameters: PENDING_STATE_A11Y };

export const Switches: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<RunTab>('summary');
    return (
      <RunTabs
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Errors (3)' }));
    await expect(args.onValueChange).toHaveBeenCalledWith('errors');
    await expect(canvas.getByRole('tab', { name: 'Errors (3)' })).toHaveAttribute('aria-selected', 'true');
  },
};
