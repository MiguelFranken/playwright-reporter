import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { LIBRARY_STATES } from '../lib/library-views';
import { LibraryStateChip } from './library-state-chip';

const meta = {
  title: 'Patterns/Status/LibraryStateChip',
  component: LibraryStateChip,
  args: { state: 'verify' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LibraryStateChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Ready to verify')).toBeInTheDocument();
  },
};

/** Every step of the review loop, with a count, and as icons for dense headings. */
export const EveryState: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {LIBRARY_STATES.map((s) => (
          <LibraryStateChip key={s} state={s} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {LIBRARY_STATES.map((s, i) => (
          <LibraryStateChip key={s} state={s} count={i * 3 + 1} />
        ))}
      </div>
      <div className="flex gap-3">
        {LIBRARY_STATES.map((s) => (
          <LibraryStateChip key={s} state={s} iconOnly />
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Waiting for changes' })).toBeInTheDocument();
  },
};
