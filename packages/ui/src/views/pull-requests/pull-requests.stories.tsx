import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { NOW } from '../../fixtures/now';
import { pullRequestHeader, pullRequestList, sparsePullRequestHeader } from '../../fixtures/pull-requests';
import { RangeToggle } from '../../patterns/filter-controls';
import { PullRequestHeader, PullRequestHeaderSkeleton } from './pull-request-header';
import { PullRequestsTable } from './pull-requests-table';

const hrefs = {
  run: (n: number) => `#run-${n}`,
  pullRequest: (n: number) => `#pr-${n}`,
  branch: (name: string) => `#branch-${name}`,
};

const meta = {
  title: 'Views/Pull requests',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Table: Story = { render: () => <PullRequestsTable hrefs={hrefs} rows={pullRequestList} now={NOW} /> };

export const TableEmpty: Story = {
  render: () => <PullRequestsTable hrefs={hrefs} rows={[]} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no pull requests in this range/i)).toBeVisible();
  },
};

/** Each request opens its page; its branch, the git host and the last run keep their own links. */
export const TableLinks: Story = {
  render: () => <PullRequestsTable hrefs={hrefs} rows={pullRequestList} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // GitLab's merge requests read `!1524`, GitHub's pull requests `#318`.
    await expect(canvas.getByRole('link', { name: /^!1524 Stop shared caching/ })).toHaveAttribute('href', '#pr-1524');
    await expect(canvas.getByRole('link', { name: /^#318 feat\(checkout\)/ })).toHaveAttribute('href', '#pr-318');
    await expect(canvas.getByRole('link', { name: 'Open !1524 on the git host' })).toHaveAttribute(
      'href',
      'https://gitlab.example/mop/ecma/ms_frontend/-/merge_requests/1524',
    );
    await expect(canvas.getByRole('link', { name: 'fix/e2e-stage-run-19-failures' })).toHaveAttribute('href', '#branch-fix/e2e-stage-run-19-failures');
    await expect(canvas.getByRole('link', { name: /#482/ })).toHaveAttribute('href', '#run-482');
  },
};

/** A request reported by number alone still opens, without a title or a way to the host. */
export const TableNumberOnly: Story = {
  render: () => <PullRequestsTable hrefs={hrefs} rows={pullRequestList.filter((r) => r.title === null)} now={NOW} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: '#77' })).toHaveAttribute('href', '#pr-77');
    await expect(canvas.queryAllByRole('link', { name: /on the git host/ })).toHaveLength(0);
  },
};

export const Header: Story = {
  render: () => (
    <PullRequestHeader pullRequest={pullRequestHeader} hrefs={hrefs} now={NOW}>
      <RangeToggle value="30" onValueChange={fn()} />
    </PullRequestHeader>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /!1524 Stop shared caching/ })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Open merge request' })).toHaveAttribute('href', pullRequestHeader.url);
    await expect(canvas.getByRole('link', { name: 'fix/e2e-stage-run-19-failures' })).toHaveAttribute('href', '#branch-fix/e2e-stage-run-19-failures');
    // Only the first line of the commit message.
    await expect(canvas.getByRole('link', { name: /#482 · test\(e2e\): accept the serialized empty hotel select in FF-22$/ })).toHaveAttribute('href', '#run-482');
  },
};

export const HeaderSparse: Story = {
  render: () => <PullRequestHeader pullRequest={sparsePullRequestHeader} hrefs={hrefs} now={NOW} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { name: '#77 Pull request' })).toBeVisible();
  },
};

export const HeaderLoading: Story = { render: () => <PullRequestHeaderSkeleton /> };
