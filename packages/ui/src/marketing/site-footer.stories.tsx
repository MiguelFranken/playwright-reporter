import type { Meta, StoryObj } from '@storybook/react';
import { footerColumns, footerLegal, SITE_NAME, social } from '../fixtures/marketing';
import { SiteFooter } from './site-footer';

const meta = {
  title: 'Marketing/SiteFooter',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    siteName: SITE_NAME,
    columns: footerColumns,
    legal: footerLegal,
    social,
    copyright: '© {year} denkwerk. MIT licensed.',
  },
} satisfies Meta<typeof SiteFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Before the site has legal pages or a public repository. */
export const Sparse: Story = {
  args: { columns: [], legal: [], social: [], copyright: null },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
