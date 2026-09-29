import type { Meta, StoryObj } from '@storybook/react';
import { legacyFlow, placeOrderFlow, unavailableFlow } from '../../fixtures/review';
import { ScreenFrame } from './screen-frame';

const tall = placeOrderFlow.checkpoints[1].captures;

const meta = {
  title: 'Views/Review/Screens/ScreenFrame',
  component: ScreenFrame,
  args: { image: tall[0].image, frame: { width: 1280, height: 720 }, zoom: 0.4, alt: 'Checkout filled in — desktop' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ScreenFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A full-page desktop capture on a laptop-shaped screen: scroll inside it to read the page. */
export const Desktop: Story = {};

/** A phone is portrait, whatever the image is. */
export const Mobile: Story = { args: { image: tall[1].image, frame: { width: 390, height: 844 }, zoom: 0.5, alt: 'Checkout filled in — mobile' } };

/** A small preview: the top of the page, no scrolling. */
export const Preview: Story = { args: { zoom: 0.18, scroll: false } };

export const Legacy: Story = { args: { image: legacyFlow.checkpoints[0].captures[1].image, frame: { width: 390, height: 844 }, zoom: 0.4, alt: 'Help email — mobile' } };

export const Unavailable: Story = { args: { image: unavailableFlow.checkpoints[0].captures[1].image, zoom: 0.25 } };
