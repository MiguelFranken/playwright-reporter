import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { REACHABLE_PROJECTS } from '../../fixtures/account';
import { McpConnectionTest, type McpConnectionResult } from './mcp-connection-test';

const meta = {
  title: 'Views/Account/MCP connection test',
  component: McpConnectionTest,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { result: null, onTest: fn() },
  decorators: [
    (Story) => (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof McpConnectionTest>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Test connection' }));
    await expect(args.onTest).toHaveBeenCalledOnce();
  },
};

export const Testing: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Testing…' })).toBeDisabled();
  },
};

/** More than five projects: the first five, then a count. */
export const Reachable: Story = {
  args: { result: { ok: true, enabled: true, disabledBy: null, projects: REACHABLE_PROJECTS } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Your assistant can reach 7 projects: acme/web, acme/checkout, acme/admin, platform/design-system, platform/api and 2 more.',
    );
  },
};

export const OneProject: Story = {
  args: { result: { ok: true, enabled: true, disabledBy: null, projects: ['acme/web'] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Your assistant can reach 1 project: acme/web.');
  },
};

export const NoProjects: Story = {
  args: { result: { ok: true, enabled: true, disabledBy: null, projects: [] } },
};

export const SwitchedOffByAdmin: Story = {
  args: { result: { ok: true, enabled: false, disabledBy: 'admin', projects: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('switched off by an administrator');
  },
};

export const SwitchedOffByEnvironment: Story = {
  args: { result: { ok: true, enabled: false, disabledBy: 'environment', projects: [] } },
};

export const Failed: Story = {
  args: { result: { ok: false, message: 'Sign in first.' } },
};

/** The status region is announced when a result arrives. */
export const RunsATest: Story = {
  render: function Render(args) {
    const [result, setResult] = useState<McpConnectionResult | null>(null);
    return (
      <McpConnectionTest
        {...args}
        result={result}
        onTest={() => {
          args.onTest();
          setResult({ ok: true, enabled: true, disabledBy: null, projects: ['acme/web', 'acme/checkout'] });
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement();
    await userEvent.click(canvas.getByRole('button', { name: 'Test connection' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('The server is on.');
  },
};
