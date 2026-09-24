import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { FlaskConical, SearchX } from 'lucide-react';
import { Button } from '../components/button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Patterns/EmptyState',
  component: EmptyState,
  args: { title: 'No runs yet' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** First run: the empty state is the onboarding, so it carries the next step. */
export const FirstRun: Story = {
  args: {
    icon: FlaskConical,
    title: 'No runs yet',
    description: 'Add the reporter to your Playwright config and the first run will appear here.',
    children: <Button size="sm">Show me how</Button>,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /show me how/i })).toBeVisible();
  },
};

/** Filtered to nothing — a different problem, so a different message. */
export const NoMatches: Story = {
  args: {
    icon: SearchX,
    title: 'No tests match these filters',
    description: 'Try widening the time range or clearing the branch filter.',
    children: (
      <Button size="sm" variant="outline">
        Clear filters
      </Button>
    ),
  },
};

export const TitleOnly: Story = { args: { title: 'Nothing to configure for this project.' } };

export const LongText: Story = {
  args: {
    title: 'This project has not reported a run in the selected time range',
    description:
      'The last run finished 94 days ago on branch release/2026-06-12-hotfix-checkout. Widen the range to see it, or check that CI is still pointed at this project token.',
  },
};
