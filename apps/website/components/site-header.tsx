import { SiteHeader } from '@miguelfranken/ui/marketing/site-header';
import { ThemedImage } from '@miguelfranken/ui/marketing/themed-image';
import { resolveLink, resolveLinks } from '@/lib/links';
import { resolveMedia } from '@/lib/media';
import { queryHeader, querySiteSettings } from '@/lib/queries';

export async function Header() {
  const [header, settings] = await Promise.all([queryHeader(), querySiteSettings()]);
  const logo = resolveMedia(header.logo);

  const nav = (header.navItems ?? [])
    .map((item) => resolveLink(item.link))
    .filter((link) => link !== null)
    .map((link) => ({ href: link.href, label: link.label }));

  return (
    <SiteHeader
      siteName={settings.siteName}
      logo={
        logo ? (
          <ThemedImage
            sources={{ light: logo, alt: logo.alt }}
            className="h-6 w-auto"
            priority
          />
        ) : undefined
      }
      nav={nav}
      ctas={resolveLinks(header.ctas)}
      githubHref={header.showGithub === false ? null : (settings.githubUrl ?? null)}
      themeToggle={header.showThemeToggle !== false}
    />
  );
}
