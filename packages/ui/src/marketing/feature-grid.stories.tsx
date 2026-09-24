import type { Meta, StoryObj } from '@storybook/react';
import { Activity, Bug, Repeat2 } from 'lucide-react';
import { featureItems } from '../fixtures/marketing';
import { FeatureGrid } from './feature-grid';

const icons = [Activity, Bug, Repeat2];

const meta = {
  title: 'Marketing/FeatureGrid',
  component: FeatureGrid,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: {
      eyebrow: 'What you get',
      heading: 'Three things the HTML report cannot do',
      align: 'center',
    },
    items: featureItems.map((item, i) => ({ ...item, icon: icons[i] })),
    columns: 3,
  },
} satisfies Meta<typeof FeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Eight capabilities in four columns — the dense end of the range. */
export const Dense: Story = {
  args: {
    columns: 4,
    header: { heading: 'Everything in the box' },
    items: [
      ...featureItems,
      { title: 'Shards', description: 'Each shard reports separately; the run merges them as they land.' },
      { title: 'Teams', description: 'Teams, roles, invitations and an audit log.' },
      { title: 'Own the data', description: 'Your Postgres, your blob store, your Vercel project.' },
      { title: 'One line to set up', description: 'A reporter entry with a token and a server URL.' },
      { title: 'Git and CI metadata', description: 'Branch, commit, author, PR and build URL, captured automatically.' },
    ].map((item) => ({ ...item, icon: null })),
  },
};

export const WithLinks: Story = {
  args: {
    items: featureItems.map((item, i) => ({
      ...item,
      icon: icons[i],
      link: { href: '/features', label: 'Read more' },
    })),
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
