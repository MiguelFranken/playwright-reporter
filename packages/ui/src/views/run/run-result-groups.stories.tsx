import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { mixedResults, passedResults } from '../../fixtures/results';
import { RunResultGroups } from './run-result-groups';

const hrefs = { result: (id: string) => `#result-${id}` };

const meta = {
  title: 'Views/Run/RunResultGroups',
  component: RunResultGroups,
  args: { hrefs, rows: mixedResults },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof RunResultGroups>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A file holding a failure opens itself; a clean one stays folded away. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/keeps a guest cart across sign-in/i)).toBeVisible();
  },
};

export const AllPassed: Story = { args: { rows: passedResults } };

export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no tests match/i)).toBeVisible();
  },
};

/** The expand-all switch overrides every group's own default, in both directions. */
export const ExpandsEveryGroup: Story = {
  args: { rows: passedResults, expandAll: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/rejects a wrong password/i)).toBeVisible();
  },
};

/** A group folds on its own when clicked, whatever it started as. */
export const TogglesOneGroup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getAllByRole('button')[0]!;
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(header);
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  },
};
