import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { PROFILE_TEAMS } from '../../fixtures/account';
import { ProfileDetails } from './profile-details';

const meta = {
  title: 'Views/Account/Profile details',
  component: ProfileDetails,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { email: 'ada@acme.test', isSuperadmin: false, teams: PROFILE_TEAMS },
} satisfies Meta<typeof ProfileDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('User')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Acme · owner' })).toHaveAttribute('href', '/teams/acme');
  },
};

export const Superadmin: Story = { args: { isSuperadmin: true } };

export const NoTeams: Story = {
  args: { teams: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('None')).toBeVisible();
  },
};

/** A long address wraps instead of pushing the grid wide. */
export const LongEmail: Story = {
  args: { email: 'firstname.middlename.lastname+playwright-reporter@engineering.subsidiary.acme-corporation.test' },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
};
