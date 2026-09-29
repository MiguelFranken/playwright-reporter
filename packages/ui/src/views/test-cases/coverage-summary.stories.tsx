import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { coverage, emptyCoverage } from '../../fixtures/test-cases';
import { CoverageSummary } from './coverage-summary';

const meta = {
  title: 'Views/TestCases/Library/CoverageSummary',
  component: CoverageSummary,
  tags: ['themed'],
  args: {
    coverage,
    hrefs: { planned: '/cases?automation=planned', failing: '/cases?verdict=failing', attention: '/cases?attention=1', uncovered: '/cases?adopt=1' },
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CoverageSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Deprecated cases count in the total only: 20 of the 40 live cases are automated. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('50%')).toBeVisible();
    await expect(c.getByRole('link', { name: '3: Show failing cases' })).toHaveAttribute('href', '/cases?verdict=failing');
    await expect(c.getByRole('link', { name: '17: Adopt tests without a case' })).toBeVisible();
  },
};

export const NoCasesYet: Story = { args: { coverage: emptyCoverage } };

export const WithoutAdopting: Story = { args: { hrefs: { planned: '#', failing: '#', attention: '#' } } };
