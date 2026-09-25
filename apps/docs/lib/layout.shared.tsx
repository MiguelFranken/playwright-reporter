import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandTitle } from '@/components/brand';

export const REPOSITORY = 'https://github.com/MiguelFranken/playwright-reporter';
export const DEMO = 'https://playwright-reporter-nine.vercel.app/demo';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <BrandTitle />, url: '/docs' },
    githubUrl: REPOSITORY,
    links: [{ text: 'Live demo', url: DEMO, external: true }],
  };
}
