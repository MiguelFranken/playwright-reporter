import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from './avatar';

const meta = {
  title: 'Primitives/Avatar',
  component: Avatar,
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'default', 'lg'] } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * No network in the catalogue: the "image" is an inline SVG data URI, so the
 * story renders identically offline and in CI.
 */
const FACE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5b7cfa"/><circle cx="32" cy="25" r="11" fill="#fff"/><path d="M8 64c0-13 11-21 24-21s24 8 24 21z" fill="#fff"/></svg>`,
  );

export const Default: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src={FACE} alt="Ada Lovelace" />
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>
  ),
};

/** With no image, the initials carry the identity — and stay legible at every size. */
export const Fallback: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(['sm', 'default', 'lg'] as const).map((size) => (
        <Avatar key={size} size={size}>
          <AvatarFallback>AL</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText('AL')).toHaveLength(3);
  },
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>GH</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>KJ</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+7</AvatarGroupCount>
    </AvatarGroup>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>AL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  ),
};
