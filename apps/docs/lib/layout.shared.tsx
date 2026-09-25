import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const REPOSITORY = 'https://github.com/MiguelFranken/playwright-reporter';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Playwright Reporter' },
    githubUrl: REPOSITORY,
    links: [{ text: 'Live demo', url: 'https://playwright-reporter-nine.vercel.app/demo', external: true }],
  };
}
