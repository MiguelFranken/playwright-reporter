import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../../components/button';
import { NOW } from '../../fixtures/now';
import { caseDetail, emptyDetail, fieldDefs, gherkinDetail, longCaseRow } from '../../fixtures/test-cases';
import { CaseDetailView } from './case-detail';

const meta = {
  title: 'Views/TestCases/Case/CaseDetail',
  component: CaseDetailView,
  tags: ['themed'],
  args: {
    detail: caseDetail,
    fieldDefs,
    now: NOW,
    hrefs: { test: (id: string) => `/tests/${id}`, run: (n: number) => `/runs/${n}`, previous: null, next: '/cases/2' },
    position: { index: 1, total: 6 },
    canEdit: true,
    onUnlink: fn(),
    linkAction: (
      <Button variant="outline" size="sm">
        Link tests
      </Button>
    ),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CaseDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByText('Linked from code')).toBeVisible();
    await expect(c.getByText('41/42 passed')).toBeVisible();
    await expect(c.getByRole('button', { name: 'Previous case' })).toBeDisabled();
    await expect(c.getByRole('link', { name: 'Next case' })).toHaveAttribute('href', '/cases/2');
    await userEvent.click(c.getByRole('button', { name: 'Unlink logs in with a password (firefox)' }));
    await expect(args.onUnlink).toHaveBeenCalledWith(expect.objectContaining({ testId: 't2' }));
  },
};

export const Gherkin: Story = { args: { detail: gherkinDetail } };

/** Nothing written yet and nothing linked: the page says how to link a test from code. */
export const Empty: Story = {
  args: { detail: emptyDetail, fieldDefs: [], position: null, hrefs: { test: () => '#', run: () => '#' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('@TC-3')).toBeVisible();
  },
};

export const LongText: Story = {
  args: {
    detail: {
      ...caseDetail,
      ...longCaseRow,
      description: 'A very long description. '.repeat(40),
      links: caseDetail.links,
      customFields: { owner: 'Someone with an exceptionally long name that wraps', notes: 'Line one\nLine two\nLine three' },
    },
  },
};

export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole('button', { name: /Unlink/ })).toBeNull();
    await expect(c.queryByRole('button', { name: 'Link tests' })).toBeNull();
  },
};
