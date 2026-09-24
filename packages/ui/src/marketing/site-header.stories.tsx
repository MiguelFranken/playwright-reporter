import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { githubCta, nav, primaryCta, SITE_NAME } from '../fixtures/marketing';
import { SiteHeader } from './site-header';

const meta = {
  title: 'Marketing/SiteHeader',
  component: SiteHeader,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    siteName: SITE_NAME,
    nav,
    ctas: [primaryCta],
    githubHref: githubCta.href,
    activeHref: '/features',
  },
} satisfies Meta<typeof SiteHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No GitHub link and no theme toggle: the header still balances. */
export const Minimal: Story = {
  args: { githubHref: null, themeToggle: false, ctas: [] },
};

/** Long labels in every slot — the case that breaks a naive flex row. */
export const LongText: Story = {
  args: {
    siteName: 'Playwright Reporter for Teams',
    nav: [
      { href: '/features', label: 'Features and capabilities' },
      { href: '/how-it-works', label: 'How the ingest pipeline works' },
      { href: '/compare', label: 'Compare with the HTML report' },
    ],
    ctas: [{ ...primaryCta, label: 'Deploy your own instance' }],
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** The sheet is the whole mobile navigation, so it has to open. */
export const OpensTheMobileMenu: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open menu/i }));
    // Base UI portals the sheet out of the canvas, and the desktop nav is
    // still in the DOM (merely hidden), so the query has to be scoped to it.
    const sheet = within(await within(document.body).findByRole('dialog'));
    const link = await sheet.findByRole('link', { name: 'Features' });
    // The sheet fades in, and an opacity-0 ancestor counts as not visible.
    await waitFor(() => expect(link).toBeVisible());
  },
};
