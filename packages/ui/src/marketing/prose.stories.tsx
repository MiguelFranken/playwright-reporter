import type { Meta, StoryObj } from '@storybook/react';
import { Prose } from './prose';

const meta = {
  title: 'Marketing/Prose',
  component: Prose,
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof Prose>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What an editor's rich text turns into. Every heading is a system role. */
export const Default: Story = {
  args: {
    children: (
      <>
        <h2>What this is</h2>
        <p>
          A self-hosted home for Playwright test runs. The reporter streams results into your own
          deployment while CI is still running; the app keeps the history, the artifacts and the
          flakiness analytics.
        </p>
        <h3>What it needs</h3>
        <ul>
          <li>A Postgres database</li>
          <li>A blob store, or a writable directory</li>
          <li>
            One entry in <code>playwright.config.ts</code>
          </li>
        </ul>
        <blockquote>It is not a test-management tool, and it is not a trace viewer.</blockquote>
        <h4>Licence</h4>
        <p>
          MIT. See <a href="https://github.com/mfranken/playwright-reporter">the repository</a>.
        </p>
      </>
    ),
  },
};
