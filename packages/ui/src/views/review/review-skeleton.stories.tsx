import type { Meta, StoryObj } from '@storybook/react';
import { ReviewStoryboardSkeleton } from './review-skeleton';

const meta = {
  title: 'Views/Review/Storyboard/ReviewStoryboardSkeleton',
  component: ReviewStoryboardSkeleton,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReviewStoryboardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
