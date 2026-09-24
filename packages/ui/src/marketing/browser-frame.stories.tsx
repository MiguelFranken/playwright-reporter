import type { Meta, StoryObj } from '@storybook/react';
import { screenshotPair } from '../fixtures/marketing';
import { BrowserFrame } from './browser-frame';
import { ThemedImage } from './themed-image';

const meta = {
  title: 'Marketing/BrowserFrame',
  component: BrowserFrame,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    url: 'reports.example.com/acme/web/runs/481',
    children: <ThemedImage sources={screenshotPair} />,
  },
} satisfies Meta<typeof BrowserFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Browser: Story = {};

export const WithoutUrl: Story = { args: { url: undefined } };

/** A cropped detail reads better without a window around it. */
export const Plain: Story = { args: { frame: 'plain' } };

export const WithCaption: Story = {
  args: { caption: 'Run 481 — fourteen failures, nine of them flaky.' },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
