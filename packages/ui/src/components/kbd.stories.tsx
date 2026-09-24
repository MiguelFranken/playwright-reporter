import type { Meta, StoryObj } from '@storybook/react';
import { Kbd, KbdGroup } from './kbd';

const meta = {
  title: 'Primitives/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: '⌘' } };

export const Combination: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
};

export const InSentence: Story = {
  render: () => (
    <p className="text-body-s">
      Press{' '}
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>{' '}
      to jump to a test.
    </p>
  ),
};
