import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { ChevronDown, Copy, Download } from 'lucide-react';
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from './button-group';
import { Button } from './button';

const meta = {
  title: 'Primitives/ButtonGroup',
  component: ButtonGroup,
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">
        <Download /> Download trace
      </Button>
      <Button variant="outline" size="icon" aria-label="More">
        <ChevronDown />
      </Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(2);
  },
};

export const WithSeparator: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Passed</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Flaky</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Failed</Button>
    </ButtonGroup>
  ),
};

export const WithText: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <ButtonGroupText>pwr_live_9f2c…8a41</ButtonGroupText>
      <Button variant="outline" size="icon" aria-label="Copy token">
        <Copy />
      </Button>
    </ButtonGroup>
  ),
};

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Re-run</Button>
      <Button variant="outline">Re-run failed</Button>
      <Button variant="outline">Cancel</Button>
    </ButtonGroup>
  ),
};
