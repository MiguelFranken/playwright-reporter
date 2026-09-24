import type { Block } from 'payload';
import { link } from '../fields/link';
import { sectionHeader } from '../fields/section-header';
import { sectionSettings } from '../fields/section-settings';

/**
 * A curated slice of lucide, not the whole set: an editor picking freely
 * produces a grid that reads as clip-art. Every name here exists in
 * `lucide-react` and is mapped in `components/blocks/icons.ts`.
 */
export const featureIcons = [
  'Activity',
  'Radio',
  'Bug',
  'Camera',
  'Video',
  'Route',
  'Repeat2',
  'ShieldCheck',
  'Database',
  'Cloud',
  'Users',
  'KeyRound',
  'GitBranch',
  'Layers',
  'Timer',
  'Search',
] as const;

export type FeatureIconName = (typeof featureIcons)[number];

export const FeatureGridBlock: Block = {
  slug: 'featureGrid',
  interfaceName: 'FeatureGridBlock',
  labels: { singular: 'Feature grid', plural: 'Feature grids' },
  fields: [
    sectionHeader(),
    {
      name: 'columns',
      type: 'select',
      defaultValue: '3',
      options: ['2', '3', '4'].map((value) => ({ label: value, value })),
    },
    {
      name: 'items',
      type: 'array',
      minRows: 2,
      maxRows: 8,
      required: true,
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'icon',
              type: 'select',
              options: featureIcons.map((value) => ({ label: value, value })),
              admin: { width: '40%' },
            },
            { name: 'title', type: 'text', required: true, admin: { width: '60%' } },
          ],
        },
        { name: 'description', type: 'textarea', required: true },
        link({ required: false }),
      ],
    },
    sectionSettings(),
  ],
};
