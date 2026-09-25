import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { TEAM_AVATAR, USER_AVATAR } from '../fixtures/avatars';
import { ProfileAvatar } from './profile-avatar';

const meta = {
  title: 'Patterns/ProfileAvatar',
  component: ProfileAvatar,
  args: { name: 'Ada Lovelace', image: USER_AVATAR },
  argTypes: {
    shape: { control: 'inline-radio', options: ['circle', 'square'] },
    size: { control: 'inline-radio', options: ['sm', 'default', 'lg'] },
  },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof ProfileAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No image: the initials carry the identity. */
export const Initials: Story = {
  args: { image: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('AL')).toBeVisible();
  },
};

/** An email address as the only name still yields two letters. */
export const InitialsFromEmail: Story = {
  args: { name: 'ada.lovelace@acme.test', image: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('AL')).toBeVisible();
  },
};

export const Team: Story = { args: { name: 'Acme Platform', image: TEAM_AVATAR, shape: 'square' } };
export const TeamInitials: Story = { args: { name: 'Acme Platform', image: null, shape: 'square' } };

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      <ProfileAvatar {...args} size="sm" />
      <ProfileAvatar {...args} />
      <ProfileAvatar {...args} size="lg" />
      <ProfileAvatar {...args} className="size-16" fallbackClassName="text-lg" />
    </div>
  ),
};

/** Members list, sidebar team switcher: next to a name, circles for people, squares for teams. */
export const InContext: Story = {
  render: () => (
    <ul className="flex flex-col gap-3 text-sm">
      <li className="flex items-center gap-2">
        <ProfileAvatar name="Ada Lovelace" image={USER_AVATAR} size="sm" />
        Ada Lovelace
      </li>
      <li className="flex items-center gap-2">
        <ProfileAvatar name="grace@acme.test" image={null} size="sm" />
        grace@acme.test
      </li>
      <li className="flex items-center gap-2">
        <ProfileAvatar name="Acme Platform" image={TEAM_AVATAR} shape="square" size="sm" />
        Acme Platform
      </li>
    </ul>
  ),
};
