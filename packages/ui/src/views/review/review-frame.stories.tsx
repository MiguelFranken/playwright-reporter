import type { Meta, StoryObj } from '@storybook/react';
import { placeOrderFlow, unavailableFlow } from '../../fixtures/review';
import { ReviewFrame } from './review-frame';

const [desktop, mobile] = placeOrderFlow.checkpoints[0].captures;
const [pending, expired] = unavailableFlow.checkpoints[0].captures;

const meta = {
  title: 'Views/Review/Screens/ReviewFrame',
  component: ReviewFrame,
  args: { image: desktop.image, viewport: desktop.viewport, alt: 'Your cart — desktop' },
} satisfies Meta<typeof ReviewFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = { args: { image: mobile.image, viewport: mobile.viewport, alt: 'Your cart — mobile' } };

/** Without a viewport the frame falls back to 16:10. */
export const UnknownViewport: Story = { args: { viewport: null } };

export const Uploading: Story = { args: { image: pending.image, alt: 'Account — desktop' } };

export const Expired: Story = { args: { image: expired.image, viewport: expired.viewport, alt: 'Account — mobile' } };
