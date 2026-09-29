import type { Meta, StoryObj } from '@storybook/react';
import { REVIEW_STATUSES } from '../lib/review';
import { ReviewStatusBadge, ReviewStatusDot } from './review-status-badge';

const meta = {
  title: 'Patterns/ReviewStatusBadge',
  component: ReviewStatusBadge,
  args: { status: 'changed' },
  tags: ['themed'],
} satisfies Meta<typeof ReviewStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map((s) => (
          <ReviewStatusBadge key={s} status={s} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        {REVIEW_STATUSES.map((s) => (
          <ReviewStatusDot key={s} status={s} />
        ))}
      </div>
    </div>
  ),
};
