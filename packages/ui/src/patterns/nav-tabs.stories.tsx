import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { NavTabs, NavTabsSkeleton } from './nav-tabs';

const ITEMS = [
  { href: '/teams/acme/settings/members', label: 'Members' },
  { href: '/teams/acme/settings/projects', label: 'Projects' },
  { href: '/teams/acme/settings/general', label: 'General' },
];

const meta = {
  title: 'Patterns/NavTabs',
  component: NavTabs,
  args: { items: ITEMS, activeHref: ITEMS[1]!.href, label: 'Team settings sections' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof NavTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Before the route is known — a Suspense fallback, say — nothing is current. */
export const NothingActive: Story = { args: { activeHref: undefined } };

export const Loading: Story = { render: () => <NavTabsSkeleton /> };

/**
 * These are links, not tabs: the app navigates. The current one is marked
 * aria-current="page", which is what tells assistive tech where you are.
 */
export const MarksTheCurrentPage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('navigation', { name: /team settings sections/i })).toBeVisible();
    await expect(canvas.getAllByRole('link')).toHaveLength(3);

    const current = canvas.getByRole('link', { current: 'page' });
    await expect(current).toHaveTextContent('Projects');
    await expect(current).toHaveAttribute('href', '/teams/acme/settings/projects');
  },
};

export const Many: Story = {
  args: {
    items: [
      ...ITEMS,
      { href: '/teams/acme/settings/tokens', label: 'Tokens' },
      { href: '/teams/acme/settings/billing', label: 'Billing' },
      { href: '/teams/acme/settings/audit', label: 'Audit log' },
    ],
  },
};
