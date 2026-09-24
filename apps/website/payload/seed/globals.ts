import { external, internal, DOCS_URL, GITHUB_URL, type SeedContext } from './types';

/** Site settings, header and footer — everything that frames every page. */
export function siteSettings() {
  return {
    // Still the working name (WEBSITE.md §2.3): renaming the product is this
    // field plus a logo upload, not a deploy.
    siteName: 'Playwright Reporter',
    tagline: 'Every Playwright run, kept.',
    description:
      'A self-hosted home for Playwright test runs: live progress, full debugging evidence and flaky-test analytics, on your own Postgres and blob storage.',
    githubUrl: GITHUB_URL,
    docsUrl: DOCS_URL,
    announcement: { enabled: false, text: '' },
    analytics: { provider: 'none' as const },
  };
}

export function header(ctx: SeedContext) {
  return {
    navItems: [
      { link: internal(ctx, 'features', 'Features') },
      { link: internal(ctx, 'how-it-works', 'How it works') },
      { link: internal(ctx, 'get-started', 'Get started') },
      { link: internal(ctx, 'compare', 'Compare') },
    ],
    ctas: [{ link: internal(ctx, 'get-started', 'Get started', 'primary') }],
    showGithub: true,
    showThemeToggle: true,
  };
}

export function footer(ctx: SeedContext) {
  return {
    columns: [
      {
        title: 'Product',
        links: [
          { link: internal(ctx, 'features', 'Features') },
          { link: internal(ctx, 'how-it-works', 'How it works') },
          { link: internal(ctx, 'compare', 'Compare') },
        ],
      },
      {
        title: 'Resources',
        links: [
          { link: internal(ctx, 'get-started', 'Get started') },
          { link: external(DOCS_URL, 'Documentation') },
          { link: external(GITHUB_URL, 'GitHub') },
        ],
      },
      {
        title: 'Legal',
        links: [
          { link: internal(ctx, 'legal/imprint', 'Imprint') },
          { link: internal(ctx, 'legal/privacy', 'Privacy') },
        ],
      },
    ],
    legal: [
      { link: internal(ctx, 'legal/imprint', 'Imprint') },
      { link: internal(ctx, 'legal/privacy', 'Privacy') },
    ],
    copyright: '© {year} denkwerk. MIT licensed.',
    social: [{ platform: 'github' as const, url: GITHUB_URL }],
  };
}
