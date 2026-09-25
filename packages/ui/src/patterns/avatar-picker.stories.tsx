import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TEAM_AVATAR, USER_AVATAR } from '../fixtures/avatars';
import { AvatarPicker } from './avatar-picker';

const meta = {
  title: 'Patterns/AvatarPicker',
  component: AvatarPicker,
  args: { name: 'Ada Lovelace', image: USER_AVATAR, onFileSelect: fn(), onRemove: fn() },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof AvatarPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** With an image: replace it or remove it. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Replace image' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};

/** No image yet: initials, and nothing to remove. */
export const Empty: Story = {
  args: { image: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Upload image' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Remove' })).toBeNull();
  },
};

export const Team: Story = { args: { name: 'Acme Platform', image: TEAM_AVATAR, shape: 'square' } };

/** An upload is in flight. */
export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Remove' })).toBeDisabled();
  },
};

/** The picked file is handed over as it is; cropping is the host's job. */
export const PicksAFile: Story = {
  args: { image: null },
  play: async ({ canvasElement, args }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['avatar'], 'me.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await expect(args.onFileSelect).toHaveBeenCalledWith(file);
  },
};
